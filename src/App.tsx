import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { Calendar, Clock, Users, User, Phone, CheckCircle, AlertCircle, Trash2, LayoutDashboard, ClipboardList, Building, LogIn, LogOut, Shield, ShieldAlert, Download, BarChart3, X, Info } from 'lucide-react';

// ==========================================
// 1. CẤU HÌNH FIREBASE CỦA BẠN
// ==========================================
const firebaseConfig = typeof __firebase_config !== 'undefined' && __firebase_config 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyCKNBg-CPwmHRZDbPt0NZ0iRQvSj4Cu7f0",
    authDomain: "the-win-city-booking.firebaseapp.com",
    projectId: "the-win-city-booking",
    storageBucket: "the-win-city-booking.firebasestorage.app",
    messagingSenderId: "1049410170954",
    appId: "1:1049410170954:web:b27416827f01bcc56f76b3"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'the-win-city-booking';

// ==========================================
// 2. TÀI KHOẢN GỐC (SUPER ADMIN)
// ==========================================
const SUPER_ADMIN_EMAILS = [
  'minhpv@thangloigroup.vn', // Thay Gmail của bạn vào đây
  'nguyennk@thangloigroup.vn'
];

// ==========================================
// 3. HÌNH NỀN ỨNG DỤNG
// Link Facebook (fbcdn.net) tự động hết hạn sau vài ngày. 
// Hãy up ảnh của bạn lên trang như postimages.org hoặc imgur.com, 
// copy link trực tiếp (.jpg/.png) và dán vào giữa 2 dấu nháy kép bên dưới:
// ==========================================
const BACKGROUND_URL = "https://i.postimg.cc/7hQSRb42/660431692-122180502596789445-5003665343564458581-n.jpg";

// Lấy ngày hiện tại theo giờ VN
const getVietnamDateString = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

// Hàm hỗ trợ: Chuyển chuỗi "YYYY-MM-DD" thành Date
const parseDateSafe = (dStr) => {
  const [y, m, d] = dStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

// Hàm hỗ trợ: Định dạng lại Date thành "YYYY-MM-DD"
const formatDateSafe = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

// CẤU HÌNH LỊCH THEO THỨ TỰ TRONG TUẦN
const getSlotsForDate = (dateStr) => {
  if (!dateStr) return [];
  const d = parseDateSafe(dateStr);
  const day = d.getDay(); // 0 là CN, 1 là T2, 6 là T7
  
  if (day === 1) return []; // Thứ 2 nghỉ
  if (day >= 2 && day <= 5) return ['9:30', '15:00']; // Thứ 3 - Thứ 6
  if (day === 6) return ['9:00', '9:30', '11:00', '11:30', '15:00', '15:30', '16:00', '16:30']; // Thứ 7
  if (day === 0) return ['9:30', '10:30', '15:00', '15:30']; // Chủ nhật
  return [];
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [adminsList, setAdminsList] = useState([]); 
  
  const [view, setView] = useState(() => localStorage.getItem('appView') || 'form'); 
  useEffect(() => { localStorage.setItem('appView', view); }, [view]);

  const today = useMemo(() => getVietnamDateString(), []);
  
  const [selectedDate, setSelectedDate] = useState(today);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agency, setAgency] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitStatus, setSubmitStatus] = useState({ loading: false, success: false, error: null });
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  
  const [chartType, setChartType] = useState('day'); 
  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  const showAlert = (title, message) => setModal({ isOpen: true, type: 'alert', title, message, onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  const isFormValid = name.trim() !== '' && phone.trim() !== '' && agency.trim() !== '' && selectedSlot !== '';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        try {
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        } catch (error) {
          console.error("Lỗi xác thực:", error);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const regPath = collection(db, 'artifacts', appId, 'public', 'data', 'registrations'); 
    const unsubReg = onSnapshot(regPath, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRegistrations(data);
    }, (error) => console.error("Lỗi tải đăng ký:", error));

    const adminPath = collection(db, 'artifacts', appId, 'public', 'data', 'admins');
    const unsubAdmin = onSnapshot(adminPath, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdminsList(data);
    }, (error) => console.error("Lỗi tải admin:", error));

    return () => { unsubReg(); unsubAdmin(); };
  }, [user]);

  useEffect(() => {
    if (user?.email) {
      const isSuper = SUPER_ADMIN_EMAILS.includes(user.email);
      const isDynamicAdmin = adminsList.some(a => a.email === user.email);
      const hasAdminRights = isSuper || isDynamicAdmin;
      
      setIsSuperAdmin(isSuper);
      setIsAdmin(hasAdminRights);
      
      if (hasAdminRights) {
        const storedTime = localStorage.getItem('adminLoginTime');
        if (storedTime) {
          setSessionStartTime(parseInt(storedTime));
        } else {
          const now = Date.now();
          localStorage.setItem('adminLoginTime', now.toString());
          setSessionStartTime(now);
        }
      }
    } else {
      setIsSuperAdmin(false);
      setIsAdmin(false);
      setSessionStartTime(null);
    }
  }, [user, adminsList]);

  useEffect(() => {
    if (isAdmin && sessionStartTime) {
      const checkSession = () => {
        const hoursElapsed = (Date.now() - sessionStartTime) / (1000 * 60 * 60);
        if (hoursElapsed >= 4) {
          handleAdminLogout();
          showAlert('Hết hạn phiên', 'Phiên đăng nhập quản trị đã tự động hết hạn (4 giờ). Vui lòng đăng nhập lại để đảm bảo an toàn dữ liệu.');
        }
      };

      checkSession(); 
      const interval = setInterval(checkSession, 60000); 
      return () => clearInterval(interval);
    }
  }, [isAdmin, sessionStartTime]);

  useEffect(() => {
    if (user && view === 'admin' && !isAdmin) {
      setView('form');
    }
  }, [view, isAdmin, user]);

  const MAX_PER_SLOT = 10;
  
  // Lấy các khung giờ quy định cho ngày đang chọn
  const currentSlots = useMemo(() => getSlotsForDate(selectedDate), [selectedDate]);

  const todayRegistrations = useMemo(() => {
    return registrations.filter(reg => reg.date === selectedDate);
  }, [registrations, selectedDate]);

  const slotCounts = useMemo(() => {
    const counts = {};
    currentSlots.forEach(s => counts[s] = 0);
    todayRegistrations.forEach(reg => {
      if (counts[reg.slot] !== undefined) counts[reg.slot]++;
      else counts[reg.slot] = 1; // Trường hợp data cũ còn lưu
    });
    return counts;
  }, [todayRegistrations, currentSlots]);

  // Lọc chỉ giữ lại các khung giờ khả dụng (chưa qua, KHÓA TRƯỚC 10 PHÚT)
  const availableSlots = useMemo(() => {
    const isToday = selectedDate === today;
    const now = new Date();
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();

    return currentSlots.filter(slot => {
      if (!isToday) return true; // Tương lai thì mở hết
      const [slotHour, slotMinute] = slot.split(':').map(Number);
      const slotTimeInMinutes = slotHour * 60 + slotMinute;
      // Khóa ca trước 10 phút (VD: ca 9h30 thì 9h20 là đóng)
      return (slotTimeInMinutes - 10) > currentTimeInMinutes;
    });
  }, [selectedDate, today, currentSlots]);

  useEffect(() => {
    if (selectedSlot && !availableSlots.includes(selectedSlot)) {
      setSelectedSlot('');
    }
  }, [availableSlots, selectedSlot]);

  // Gộp cả khung giờ hiện tại và khung giờ cũ (nếu có khách đã đăng ký trước khi đổi luật) để Admin dễ quản lý
  const displaySlotsForAdmin = useMemo(() => {
    return Array.from(new Set([...currentSlots, ...todayRegistrations.map(r => r.slot)])).sort((a,b) => {
       const timeA = a.split(':').map(Number);
       const timeB = b.split(':').map(Number);
       return (timeA[0]*60 + timeA[1]) - (timeB[0]*60 + timeB[1]);
    });
  }, [currentSlots, todayRegistrations]);

  const chartData = useMemo(() => {
    if (chartType === 'day') {
      const data = displaySlotsForAdmin.map(slot => ({
        label: slot,
        count: registrations.filter(r => r.date === selectedDate && r.slot === slot).length
      }));
      const maxVal = Math.max(...data.map(d => d.count), 1);
      return data.map(d => ({ ...d, max: maxVal }));
    } else if (chartType === 'week') {
      const curr = parseDateSafe(selectedDate);
      let dayOfWeek = curr.getDay(); 
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      curr.setDate(curr.getDate() + diffToMonday); 
      
      const days = [];
      const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
      for (let i = 0; i < 7; i++) {
        const d = new Date(curr);
        d.setDate(curr.getDate() + i);
        const dString = formatDateSafe(d);
        days.push({
          label: labels[i],
          count: registrations.filter(r => r.date === dString).length,
        });
      }
      const maxVal = Math.max(...days.map(d => d.count), 1); 
      return days.map(d => ({ ...d, max: maxVal }));
    } else if (chartType === 'month') {
      const curr = parseDateSafe(selectedDate);
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const numDays = new Date(year, month + 1, 0).getDate(); 
      
      const weeks = [
        { label: 'Tuần 1', count: 0 }, { label: 'Tuần 2', count: 0 },
        { label: 'Tuần 3', count: 0 }, { label: 'Tuần 4', count: 0 },
        { label: 'Tuần 5', count: 0 }
      ];

      for (let i = 1; i <= numDays; i++) {
        const dString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        const countForDay = registrations.filter(r => r.date === dString).length;
        if (i <= 7) weeks[0].count += countForDay;
        else if (i <= 14) weeks[1].count += countForDay;
        else if (i <= 21) weeks[2].count += countForDay;
        else if (i <= 28) weeks[3].count += countForDay;
        else weeks[4].count += countForDay;
      }
      if (numDays === 28) weeks.pop(); 
      const maxVal = Math.max(...weeks.map(w => w.count), 1);
      return weeks.map(w => ({ ...w, max: maxVal }));
    }
    return [];
  }, [chartType, selectedDate, registrations, displaySlotsForAdmin]);

  const handleAdminLogin = async () => {
    if (isLoggingIn) return;
    try {
      if (window.self !== window.top) {
        showAlert("Cần mở tab mới", "Vui lòng mở ứng dụng này ở một TAB MỚI (hoặc dùng link Vercel của bạn) để tính năng đăng nhập Google hoạt động.");
        return;
      }
    } catch (e) { }

    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      const result = await signInWithPopup(auth, provider);
      localStorage.setItem('adminLoginTime', Date.now().toString());
      
      const email = result.user.email;
      const isSuper = SUPER_ADMIN_EMAILS.includes(email);
      const isDynamicAdmin = adminsList.some(a => a.email === email);
      
      if (isSuper || isDynamicAdmin) {
        setView('admin');
      } else {
        showAlert("Không có quyền", `Tài khoản "${email}" chưa được cấp quyền quản trị.`);
        handleAdminLogout();
      }
    } catch (error) {
      if (error.code === 'auth/unauthorized-domain') {
        showAlert('Lỗi Tên Miền', `Tên miền hiện tại đang bị Firebase chặn. Cần vào Firebase Console -> Authentication -> Settings -> Authorized domains để thêm tên miền này vào.`);
      } else if (error.code !== 'auth/popup-closed-by-user') {
        showAlert('Lỗi Đăng Nhập', `Hệ thống báo lỗi: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    localStorage.removeItem('adminLoginTime'); 
    localStorage.setItem('appView', 'form');
    setView('form');
    await signOut(auth);
  };

  const exportToExcel = () => {
    const headers = ['Giờ', 'Họ Tên', 'Số Điện Thoại', 'Đại Lý', 'Ngày Đăng Ký'];
    const rows = [...todayRegistrations]
      .sort((a,b) => a.slot.localeCompare(b.slot))
      .map(reg => [
        reg.slot, `"${reg.name}"`, `"${reg.phone}"`, `"${reg.agency}"`, reg.date.split('-').reverse().join('/')
      ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Khach_Hang_TheWinCity_${selectedDate.split('-').reverse().join('-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !isFormValid) return;
    setSubmitStatus({ loading: true, success: false, error: null });
    try {
      const path = collection(db, 'artifacts', appId, 'public', 'data', 'registrations');
      await addDoc(path, {
        name: name.trim(), phone: phone.trim(), agency: agency.trim(),
        date: selectedDate, slot: selectedSlot,
        timestamp: serverTimestamp(), userId: user.uid
      });
      setSubmitStatus({ loading: false, success: true, error: null });
      setName(''); setPhone(''); setAgency(''); setSelectedSlot('');
      setTimeout(() => setSubmitStatus(prev => ({ ...prev, success: false })), 4000);
    } catch (error) {
      setSubmitStatus({ loading: false, success: false, error: 'Có lỗi xảy ra.' });
    }
  };

  const handleDelete = (id) => {
    if (!isSuperAdmin) return;
    showConfirm("Xác nhận xóa", "Bạn có chắc chắn muốn xóa lượt đăng ký này không?", async () => {
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'registrations', id));
      } catch (error) { console.error(error); }
    });
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans selection:bg-orange-100 overflow-x-hidden">
      
      {modal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-900">{modal.title}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-full p-1 transition-colors"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-gray-600 mb-8 whitespace-pre-wrap leading-relaxed">{modal.message}</p>
            <div className="flex justify-end gap-3">
              {modal.type === 'confirm' && (
                <button onClick={closeModal} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">Hủy</button>
              )}
              <button onClick={() => { if (modal.onConfirm) modal.onConfirm(); closeModal(); }} className={`px-5 py-2.5 text-white rounded-xl text-sm font-bold shadow-md transition-colors ${modal.type === 'confirm' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'}`}>
                {modal.type === 'confirm' ? 'Xác nhận Xóa' : 'Đã hiểu'}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex justify-between h-14 items-center">
          <div className="flex items-center font-bold text-lg text-orange-700 truncate mr-2">
            <Calendar className="mr-2 h-5 w-5 flex-shrink-0"/>
            <span className="truncate">The Win City</span>
          </div>
          <div className="flex space-x-1 sm:space-x-2">
            <button onClick={() => setView('form')} className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'form' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>Đăng ký</button>
            {isAdmin && <button onClick={() => setView('admin')} className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'admin' ? 'bg-orange-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>Admin</button>}
            {isAdmin ? <button onClick={handleAdminLogout} className="text-red-500 px-2 py-1.5 text-xs font-medium hover:bg-red-50 rounded-md">Thoát</button> : <button onClick={handleAdminLogin} disabled={isLoggingIn} className="text-gray-400 px-2 py-1.5 text-xs font-medium hover:bg-gray-100 rounded-md disabled:opacity-50">{isLoggingIn ? "Đang chờ..." : "Quản trị"}</button>}
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto p-4 pb-12">
        {view === 'form' && (
          <div className="max-w-xl mx-auto bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
            <div 
              className="relative px-6 py-12 text-center bg-cover bg-center"
              style={{ backgroundImage: `url('${BACKGROUND_URL}')` }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-orange-900/60 to-orange-800/40"></div>
              <div className="relative z-10 text-white">
                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight leading-tight">ĐĂNG KÝ THAM QUAN CÔNG TRƯỜNG</h2>
                <div className="h-1 w-12 bg-orange-400 mx-auto my-3 rounded-full"></div>
                <p className="text-xs sm:text-sm text-orange-100 font-medium italic">Vui lòng điền đầy đủ thông tin để chúng tôi đón tiếp chu đáo</p>
              </div>
            </div>

            <div className="px-4 py-6 sm:p-8 space-y-6">
              {submitStatus.success && (
                <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-center animate-bounce">
                  <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0"/> Đăng ký thành công!
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Chọn ngày tham quan</label>
                  <div className="relative">
                    <div className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl bg-gray-50 text-gray-700 text-sm font-medium flex justify-between items-center pointer-events-none">
                      <span>{selectedDate.split('-').reverse().join('/')}</span>
                      <Calendar className="h-5 w-5 text-gray-400" />
                    </div>
                    {/* BẢN SỬA LỖI: Dùng CSS để kéo giãn biểu tượng chọn lịch ra toàn bộ màn hình, tránh lỗi Security iframe */}
                    <input 
                      type="date" 
                      min={today} 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer box-border z-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Chọn khung giờ</label>
                  
                  {currentSlots.length === 0 ? (
                    <div className="w-full py-5 px-3 text-center text-sm font-medium text-orange-600 bg-orange-50 border border-dashed border-orange-200 rounded-2xl flex flex-col items-center justify-center">
                      <AlertCircle className="h-6 w-6 mb-2 opacity-80" />
                      Hôm nay không có lịch tham quan công trường. Mời Quý khách vui lòng chọn ngày tiếp theo nhé!
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="w-full py-4 px-3 text-center text-sm font-medium text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-2xl">
                      Đã hết khung giờ khả dụng cho hôm nay.
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {availableSlots.map(slot => {
                        const isFull = slotCounts[slot] >= MAX_PER_SLOT;
                        const isSelected = selectedSlot === slot;
                        return (
                          <button 
                            key={slot} type="button" disabled={isFull} onClick={() => setSelectedSlot(slot)} 
                            className={`py-3 px-1 text-xs font-bold rounded-xl border-2 transition-all flex flex-col items-center justify-center ${isFull ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed' : isSelected ? 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-200 scale-105' : 'bg-white border-gray-100 text-gray-600 hover:border-orange-200'}`}
                          >
                            <span>{slot}</span>
                            <span className={`text-[9px] mt-1 font-normal ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>{isFull ? 'Kín' : `Còn ${MAX_PER_SLOT - slotCounts[slot]} ghế`}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Thông tin đăng ký</label>
                  <div className="space-y-3">
                    <input type="text" placeholder="Họ và tên của bạn" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-orange-500 focus:bg-white outline-none transition-all text-sm" required />
                    <input type="tel" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-orange-500 focus:bg-white outline-none transition-all text-sm" required />
                    <input type="text" placeholder="Tên Đại lý" value={agency} onChange={(e) => setAgency(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-orange-500 focus:bg-white outline-none transition-all text-sm" required />
                  </div>
                </div>

                <div className="pt-2">
                  <div className="bg-orange-50 text-orange-700 text-xs px-4 py-3 rounded-xl border border-orange-100 flex items-start mb-4 shadow-sm">
                    <Info className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5" />
                    <p><strong>Lưu ý:</strong> Một lần đăng ký trên hệ thống chỉ dành cho <strong className="text-orange-800">1 khách tham quan</strong>. Nếu đi theo nhóm, vui lòng điền thông tin đăng ký riêng cho từng khách.</p>
                  </div>
                  <button type="submit" disabled={submitStatus.loading || !isFormValid} className={`w-full py-4 rounded-2xl font-bold transition-all ${isFormValid && !submitStatus.loading ? 'bg-orange-600 hover:bg-orange-700 active:scale-95 text-white shadow-xl shadow-orange-200' : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'}`}>
                    {submitStatus.loading ? "ĐANG GỬI..." : "XÁC NHẬN ĐĂNG KÝ"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {view === 'admin' && isAdmin && (
          <div className="space-y-6">
             <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
                <div className="bg-gray-900 p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <h2 className="text-white font-bold flex items-center"><LayoutDashboard className="mr-2 h-5 w-5"/> Bảng Thống Kê</h2>
                  <div className="flex gap-2 w-full sm:w-auto">
                    
                    <div className="relative flex-1 sm:w-40" title="Chọn ngày">
                      <div className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-medium flex justify-between items-center pointer-events-none">
                        <span>{selectedDate.split('-').reverse().join('/')}</span>
                        <Calendar className="h-4 w-4 text-gray-400" />
                      </div>
                      <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer box-border z-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:cursor-pointer" 
                      />
                    </div>
                    
                    <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg flex items-center justify-center text-xs font-bold transition-colors shadow-sm">
                      <Download className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Xuất Excel</span>
                    </button>
                  </div>
                </div>
                
                {isSuperAdmin && (
                  <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                      <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center"><BarChart3 className="h-4 w-4 mr-1.5" /> Biểu đồ lượng khách</h3>
                      <div className="flex bg-gray-200 p-0.5 rounded-lg w-full sm:w-auto">
                        <button onClick={() => setChartType('day')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${chartType === 'day' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>Ngày</button>
                        <button onClick={() => setChartType('week')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${chartType === 'week' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>Tuần</button>
                        <button onClick={() => setChartType('month')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${chartType === 'month' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>Tháng</button>
                      </div>
                    </div>

                    <div className="flex items-end gap-1 sm:gap-2 h-32 px-1 overflow-x-auto min-w-full pb-2">
                      {chartData.map((item, idx) => {
                        const heightPercent = item.max > 0 ? (item.count / item.max) * 100 : 0;
                        return (
                          <div key={idx} className="flex-1 min-w-[30px] flex flex-col items-center justify-end h-full">
                            <span className="text-[10px] font-bold text-orange-600 mb-1">{item.count > 0 ? item.count : '0'}</span>
                            <div className="w-full max-w-[32px] bg-gray-200 rounded-t-sm relative flex justify-center items-end" style={{ height: '100%' }}>
                              <div className="w-full rounded-t-sm transition-all duration-700 bg-orange-500" style={{ height: `${heightPercent}%` }}></div>
                            </div>
                            <span className="text-[9px] text-gray-600 mt-1.5 font-medium whitespace-nowrap">{item.label}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                <div className="p-4 sm:p-5 bg-white">
                  <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center mb-4"><Users className="h-4 w-4 mr-1.5" /> Danh sách khách theo khung giờ</h3>
                  <div className="space-y-4">
                    {todayRegistrations.length === 0 ? (
                      <div className="p-10 text-center text-gray-400 border border-dashed border-gray-200 rounded-2xl">Không có đăng ký nào trong ngày này</div>
                    ) : (
                      displaySlotsForAdmin.map(slot => {
                        const slotRegs = todayRegistrations.filter(r => r.slot === slot);
                        if (slotRegs.length === 0) return null; 
                        
                        return (
                          <div key={slot} className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                            <div className="bg-orange-50/50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                              <div className="font-bold text-orange-700 flex items-center"><Clock className="h-4 w-4 mr-1.5"/> Khung giờ: {slot}</div>
                              <span className="text-[10px] font-bold text-orange-600 bg-white px-2 py-1 rounded-lg border border-orange-100 shadow-sm">
                                {slotRegs.length} / {MAX_PER_SLOT} khách
                              </span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-sm">
                                <thead>
                                  <tr className="bg-white text-gray-400 border-b border-gray-50">
                                    <th className="p-3 font-medium uppercase text-[10px]">Tên</th>
                                    <th className="p-3 font-medium uppercase text-[10px]">SĐT</th>
                                    <th className="p-3 font-medium uppercase text-[10px]">Đại lý</th>
                                    {isSuperAdmin && <th className="p-3 text-right uppercase text-[10px]">Xóa</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50 bg-white">
                                  {slotRegs.map(reg => (
                                    <tr key={reg.id} className="hover:bg-orange-50/30 transition-colors">
                                      <td className="p-3 font-medium text-gray-800">{reg.name}</td>
                                      <td className="p-3 text-gray-600">{reg.phone}</td>
                                      <td className="p-3 text-gray-500 italic">{reg.agency}</td>
                                      {isSuperAdmin && (
                                        <td className="p-3 text-right">
                                          <button onClick={() => handleDelete(reg.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4"/></button>
                                        </td>
                                      )}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
             </div>
             
             {isSuperAdmin && (
               <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                  <h3 className="font-bold flex items-center text-gray-800 mb-4"><Shield className="mr-2 h-5 w-5 text-indigo-500"/> Quản lý Admin (Dành riêng cho bạn)</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if(!newAdminEmail.trim()) return;
                    const adminPath = collection(db, 'artifacts', appId, 'public', 'data', 'admins');
                    await addDoc(adminPath, { email: newAdminEmail.trim().toLowerCase(), timestamp: serverTimestamp() });
                    setNewAdminEmail('');
                    showAlert("Thành công", "Đã cấp quyền quản trị thành công!");
                  }} className="flex gap-2">
                    <input type="email" placeholder="Gmail nhân viên..." value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} className="flex-1 p-3.5 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-indigo-400 text-sm" required />
                    <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3.5 rounded-2xl text-sm font-bold shadow-md shadow-indigo-200 transition-colors">THÊM</button>
                  </form>
                  <div className="mt-5 space-y-2">
                    {adminsList.map(ad => (
                      <div key={ad.id} className="flex justify-between items-center p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                        <span className="text-sm font-medium text-gray-700">{ad.email}</span>
                        <button onClick={() => {
                           showConfirm("Thu hồi quyền", `Bạn muốn thu hồi quyền của ${ad.email}?`, async () => {
                              await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admins', ad.id));
                           });
                        }} className="text-red-400 hover:text-red-600 text-xs font-bold transition-colors">XÓA</button>
                      </div>
                    ))}
                  </div>
               </div>
             )}
          </div>
        )}
      </main>
    </div>
  );
}