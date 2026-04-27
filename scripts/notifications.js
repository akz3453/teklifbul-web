import { auth, db } from '../firebase.js';
import { collection, query, where, orderBy, getDocs, deleteDoc, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';

const notificationsList = document.getElementById('notificationsList');
const deleteAllBtn = document.getElementById('deleteAllBtn');

async function init() {
  auth.onAuthStateChanged(async (user) => {
    if (user) {
      await loadNotifications();
    } else {
      window.location.href = '/index.html';
    }
  });

  deleteAllBtn.addEventListener('click', deleteAllNotifications);
}

async function loadNotifications() {
  try {
    const user = auth.currentUser;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const notifications = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    renderNotifications(notifications);
  } catch (error) {
    console.error('Bildirimler yüklenemedi:', error);
    notificationsList.innerHTML = '<div style="padding: 40px; text-align: center; color: #ef4444;">Bildirimler yüklenirken bir hata oluştu.</div>';
  }
}

function renderNotifications(notifications) {
  if (notifications.length === 0) {
    notificationsList.innerHTML = '<div style="padding: 60px; text-align: center; color: #9ca3af;">Henüz bir bildiriminiz yok.</div>';
    return;
  }

  notificationsList.innerHTML = notifications.map(notif => {
    const date = notif.createdAt?.toDate ? notif.createdAt.toDate() : new Date();
    const timeAgo = getTimeAgo(date);
    const bgColor = getNotificationColor(date);
    const unreadDot = !notif.read ? '<div class="unread-dot"></div>' : '';

    return `
      <div class="notif-item" style="background: ${bgColor};" data-id="${notif.id}" onclick="handleNotifClick('${notif.id}', ${notif.read})">
        ${unreadDot}
        <div class="notif-content">
          <div class="notif-title">${notif.title || 'Bildirim'}</div>
          <div class="notif-body">${notif.body || notif.message || ''}</div>
          <div class="notif-meta">
            <span>${timeAgo}</span>
            <span>•</span>
            <button class="delete-btn" onclick="deleteNotification(event, '${notif.id}')">Sil</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

window.handleNotifClick = async (id, isRead) => {
  if (!isRead) {
    await updateDoc(doc(db, 'notifications', id), { read: true, readAt: serverTimestamp() });
  }
  
  // Find notification to get data
  const q = query(collection(db, 'notifications'), where('userId', '==', auth.currentUser.uid));
  const snap = await getDocs(q);
  const notif = snap.docs.find(d => d.id === id)?.data();

  if (notif?.data?.demandId) {
    window.location.href = `/demand-detail.html?id=${notif.data.demandId}`;
  } else if (notif?.data?.bidId || notif?.data?.rfqId) {
    window.location.href = `/bids.html?tab=incoming`;
  }
};

window.deleteNotification = async (event, id) => {
  event.stopPropagation();
  if (!confirm('Bu bildirimi silmek istediğinize emin misiniz?')) return;
  
  await deleteDoc(doc(db, 'notifications', id));
  await loadNotifications();
};

async function deleteAllNotifications() {
  if (!confirm('Tüm bildirimleri silmek istediğinize emin misiniz? Bu işlem geri alınamaz.')) return;

  const user = auth.currentUser;
  const q = query(collection(db, 'notifications'), where('userId', '==', user.uid));
  const snapshot = await getDocs(q);
  
  const batch = writeBatch(db);
  snapshot.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
  
  await loadNotifications();
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + " yıl önce";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + " ay önce";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + " gün önce";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + " saat önce";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + " dakika önce";
  return "Az önce";
}

function getNotificationColor(date) {
    const diffHours = (new Date() - date) / (1000 * 60 * 60);
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('force-dark');
    
    if (diffHours < 1) return isDark ? 'rgba(34, 197, 94, 0.15)' : 'rgba(232, 255, 243, 0.9)'; 
    if (diffHours < 12) return isDark ? 'rgba(168, 85, 247, 0.1)' : 'rgba(243, 232, 255, 0.8)';
    if (diffHours < 24) return isDark ? 'rgba(245, 158, 11, 0.1)' : 'rgba(254, 243, 199, 0.8)'; 
    return isDark ? 'rgba(239, 68, 68, 0.1)' : 'rgba(254, 226, 226, 0.7)';
}

init();
