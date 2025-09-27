import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import * as functions from 'firebase-functions';
initializeApp();
const db = getFirestore();
const messaging = getMessaging();
export const sendDueRemindersV1 = functions
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
            docs.forEach(d => updates.push(d.ref.update({ sent: true, sentAt: FieldValue.serverTimestamp() })));
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
            updates.push(d.ref.update({ sent: true, sentAt: FieldValue.serverTimestamp() }));
        }
    }
    await Promise.allSettled(updates);
    return null;
});
