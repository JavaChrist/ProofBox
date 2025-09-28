"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDueRemindersV1b = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const functions = __importStar(require("firebase-functions/v1"));
(0, app_1.initializeApp)();
const db = (0, firestore_1.getFirestore)();
const messaging = (0, messaging_1.getMessaging)();
exports.sendDueRemindersV1b = functions
    .region('us-central1')
    .pubsub.schedule('every 1 minutes')
    .timeZone('Europe/Paris')
    .onRun(async () => {
    const now = Date.now();
    // petite fenêtre pour éviter les ratés
    const windowMs = 60 * 1000;
    const q = db.collectionGroup('reminders')
        .where('sent', '==', false)
        .where('atMs', '<=', now + windowMs)
        .orderBy('atMs', 'asc')
        .limit(200);
    const snap = await q.get();
    if (snap.empty)
        return;
    const updates = [];
    const byUser = new Map();
    snap.forEach(doc => {
        const parent = doc.ref.parent.parent; // users/{uid}
        if (!parent)
            return;
        const uid = parent.id;
        const arr = byUser.get(uid) || [];
        arr.push(doc);
        byUser.set(uid, arr);
    });
    for (const [uid, docs] of byUser.entries()) {
        const tokensSnap = await db.collection('users').doc(uid).collection('tokens').get();
        const tokens = tokensSnap.docs.map(d => d.id).filter(Boolean);
        if (tokens.length === 0) {
            // marque comme sent pour éviter de boucler
            docs.forEach(d => updates.push(d.ref.update({ sent: true, sentAt: firestore_1.FieldValue.serverTimestamp() })));
            continue;
        }
        const messages = docs.map(d => {
            const data = d.data();
            const title = `Rappel: ${data.itemTitle || 'Élément'}`;
            const body = data.note || '';
            return { title, body };
        });
        // envoi groupé par rappel (on peut mutualiser, mais simple ici)
        for (let i = 0; i < docs.length; i++) {
            const d = docs[i];
            const msg = messages[i];
            await messaging.sendEachForMulticast({
                tokens,
                notification: { title: msg.title, body: msg.body },
                webpush: {
                    fcmOptions: { link: '/' },
                },
                data: { url: '/' }
            });
            updates.push(d.ref.update({ sent: true, sentAt: firestore_1.FieldValue.serverTimestamp() }));
        }
    }
    await Promise.allSettled(updates);
    return null;
});
