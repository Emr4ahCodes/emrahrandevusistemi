// Basit randevu alma akışı
// - Çalışma saatleri 09:00-17:00, 30 dk aralıklarla
// - Seçili tarih/hizmete göre uygun saatleri yükle
// - Firestore'da optimistic lock / transaction ile çakışmayı engelle

import { initFirebase, onAuthReady } from './firebase.js';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

let db;
let currentUser;

function byId(id){ return document.getElementById(id); }
const form = byId('booking-form');
const serviceSel = byId('service');
const dateInput = byId('date');
const timeSel = byId('time');
const statusEl = byId('status');
const submitBtn = byId('submit');

const SLOT_MIN = 30;
const START_H = 9; // 09:00
const END_H = 17; // 17:00 (son slot 16:30)
// İsteğe bağlı takvim kısıtları
const CLOSED_WEEKDAYS = []; // Örn. sadece pazar kapalı: [0]
const MAX_DAYS_AHEAD = 60;  // En fazla 60 gün sonrası seçilebilir

function genSlots(){
  const slots = [];
  for(let h=START_H; h<END_H; h++){
    for(let m=0; m<60; m+=SLOT_MIN){
      const hh = String(h).padStart(2,'0');
      const mm = String(m).padStart(2,'0');
      slots.push(`${hh}:${mm}`);
    }
  }
  return slots;
}

function setStatus(msg, type){
  statusEl.textContent = msg;
  statusEl.className = `status ${type||''}`;
}

function clearStatus(){ setStatus(''); }

function yyyyMmDd(date){
  const d = new Date(date);
  if (isNaN(d)) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeDateStr(s){
  if(!s) return '';
  // Accept both yyyy-mm-dd and dd.mm.yyyy
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    const dd = m[1], mm = m[2], yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return s;
}

function isToday(dateStr){
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth()+1).padStart(2,'0');
  const dd = String(t.getDate()).padStart(2,'0');
  return dateStr === `${yyyy}-${mm}-${dd}`;
}

function isPastDate(dateStr){
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(dateStr + 'T00:00:00');
  return d < today;
}

function weekdayOf(dateStr){
  // 0=PAZAR ... 6=CUMARTESİ
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay();
}

function minutesFromHHMM(hhmm){
  const [h,m] = hhmm.split(':').map(Number);
  return h*60 + m;
}

function ceilToSlot(minutes, slotMin){
  return Math.ceil(minutes / slotMin) * slotMin;
}

async function fetchBookedSlots(service, dateStr){
  // Gizlilik için sadece anahtar koleksiyonundan oku
  const col = collection(db, 'appointmentKeys');
  const qy = query(col, where('service','==', service), where('date','==', dateStr));
  const snap = await getDocs(qy);
  const taken = new Set();
  snap.forEach(d => taken.add(d.get('time')));
  return taken;
}

async function refreshTimes(){
  clearStatus();
  timeSel.innerHTML = '<option value="">Yükleniyor…</option>';
  const service = serviceSel.value;
  const dateStr = normalizeDateStr(dateInput.value);
  if(!service || !dateStr){
    timeSel.innerHTML = '<option value="">Önce hizmet ve tarihe karar verin…</option>';
    return;
  }
  // Geçmiş tarihler engellenir
  if (isPastDate(dateStr)) {
    setStatus('Geçmiş tarih seçilemez.', 'error');
    timeSel.innerHTML = '<option value="">Uygun saat yok</option>';
    return;
  }
  // Kapalı gün kontrolü (örn. pazar = 0)
  if (CLOSED_WEEKDAYS.includes(weekdayOf(dateStr))) {
    setStatus('Bu tarih için hizmet verilmiyor (kapalı gün).', 'error');
    timeSel.innerHTML = '<option value="">Uygun saat yok</option>';
    return;
  }
  try{
    const taken = await fetchBookedSlots(service, dateStr);
    let all = genSlots();
    // Bugün için geçmiş saatleri gösterme
    if (isToday(dateStr)) {
      const now = new Date();
      const nowMin = now.getHours()*60 + now.getMinutes();
      const threshold = ceilToSlot(nowMin, SLOT_MIN);
      all = all.filter(t => minutesFromHHMM(t) >= threshold);
    }
    const options = all
      .filter(t => !taken.has(t))
      .map(t => `<option value="${t}">${t}</option>`);
    timeSel.innerHTML = options.length ? `<option value="">Saat seçiniz…</option>${options.join('')}` : '<option value="">Uygun saat yok</option>';
  }catch(err){
    console.error(err);
    setStatus('Saatler yüklenemedi. Lütfen tekrar deneyin.', 'error');
    timeSel.innerHTML = '<option value="">Hata oluştu</option>';
  }
}

serviceSel.addEventListener('change', refreshTimes);

dateInput.addEventListener('change', refreshTimes);

form.addEventListener('submit', async (e)=>{
  e.preventDefault();
  clearStatus();

  const service = serviceSel.value;
  const dateStr = normalizeDateStr(dateInput.value);
  const time = timeSel.value;
  const name = byId('name').value.trim();
  const email = byId('email').value.trim();
  const phone = byId('phone').value.trim();
  const notes = byId('notes').value.trim();

  if (!currentUser || currentUser.isAnonymous){
    setStatus('Randevu almak için lütfen Google ile giriş yapın.', 'error');
    return;
  }

  if(!service || !dateStr || !time || !name || !email){
    setStatus('Lütfen zorunlu alanları doldurun.', 'error');
    return;
  }

  submitBtn.disabled = true;
  setStatus('Randevunuz kaydediliyor…');

  try{
    // Transaction ile aynı saat diliminde çakışmayı engelle
    await runTransaction(db, async (trx) => {
      const apptCol = collection(db, 'appointments');
      // Basit benzersiz anahtar: service+date+time
      const key = `${service}|${dateStr}|${time}`;
      const keyDocRef = doc(collection(db, 'appointmentKeys'), key);

      const keySnap = await trx.get(keyDocRef);
      if (keySnap.exists()) {
        throw new Error('Bu saat az önce doldu. Lütfen başka saat seçin.');
      }

      // Randevu dokümanı için id oluştur ve transaction içinde yaz
      const apptDocRef = doc(apptCol);
        trx.set(keyDocRef, { service, date: dateStr, time, createdAt: serverTimestamp() });
        trx.set(apptDocRef, { 
          service, date: dateStr, time,
          name, email, phone, notes,
          userId: (currentUser && !currentUser.isAnonymous) ? currentUser.uid : null,
          userEmail: (currentUser && !currentUser.isAnonymous) ? (currentUser.email || null) : null,
          createdAt: serverTimestamp(), key 
        });
    });

    setStatus('Randevunuz oluşturuldu. Teşekkürler!', 'success');
    form.reset();
    await refreshTimes();
  }catch(err){
    console.error(err);
    setStatus(err.message || 'Randevu alınamadı. Lütfen tekrar deneyin.', 'error');
  }finally{
    submitBtn.disabled = false;
  }
});

// init
try{
  ({ db } = initFirebase());
  onAuthReady((user)=>{
    currentUser = user;
    // Bugünün tarihini default ata
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    dateInput.value = todayStr;
    // Bu sayfa artık requireAuth ile korunuyor; sadece bilgilendirme yap
    clearStatus();
    // Min/max tarih kısıtları
    dateInput.min = todayStr;
    const max = new Date(today); max.setDate(max.getDate()+MAX_DAYS_AHEAD);
    const maxStr = `${max.getFullYear()}-${String(max.getMonth()+1).padStart(2,'0')}-${String(max.getDate()).padStart(2,'0')}`;
    dateInput.max = maxStr;
    // Bazı tarayıcılarda locale inputu olabilir, normalize et
    dateInput.addEventListener('input', () => {
      const norm = normalizeDateStr(dateInput.value);
      if (norm && norm !== dateInput.value) {
        dateInput.value = norm;
      }
    });
    refreshTimes();
  });
}catch(err){
  console.error(err);
  setStatus(err.message || 'Konfigürasyon hatası', 'error');
}
