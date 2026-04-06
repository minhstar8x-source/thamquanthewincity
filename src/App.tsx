import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { Calendar, Clock, Users, User, Phone, CheckCircle, AlertCircle, Trash2, LayoutDashboard, ClipboardList, Building, LogIn, LogOut, Shield, ShieldAlert, Download, BarChart3, X } from 'lucide-react';

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
  'minhpv@thangloigroup.vn' // Thay Gmail của bạn vào đây
];

// Lấy ngày hiện tại theo giờ VN
const getVietnamDateString = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

// Hàm hỗ trợ: Chuyển chuỗi "YYYY-MM-DD" thành Date nội bộ an toàn (tránh lệch múi giờ)
const parseDateSafe = (dStr) => {
  const [y, m, d] = dStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

// Hàm hỗ trợ: Định dạng lại Date thành "YYYY-MM-DD"
const formatDateSafe = (date) => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false); // Phân quyền cấp 2
  const [registrations, setRegistrations] = useState([]);
  const [adminsList, setAdminsList] = useState([]); 
  const [view, setView] = useState('form'); 
  
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
  
  // Trạng thái Biểu đồ
  const [chartType, setChartType] = useState('day'); // 'day', 'week', 'month'

  const [modal, setModal] = useState({ isOpen: false, type: 'alert', title: '', message: '', onConfirm: null });

  const showAlert = (title, message) => setModal({ isOpen: true, type: 'alert', title, message, onConfirm: null });
  const showConfirm = (title, message, onConfirm) => setModal({ isOpen: true, type: 'confirm', title, message, onConfirm });
  const closeModal = () => setModal({ ...modal, isOpen: false });

  const isFormValid = name.trim() !== '' && phone.trim() !== '' && agency.trim() !== '' && selectedSlot !== '';

  // Khởi tạo Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Lỗi xác thực:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Lấy dữ liệu Realtime
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

  // Kiểm tra phân quyền đa cấp & Cấp Session
  useEffect(() => {
    if (user?.email) {
      const isSuper = SUPER_ADMIN_EMAILS.includes(user.email);
      const isDynamicAdmin = adminsList.some(a => a.email === user.email);
      const hasAdminRights = isSuper || isDynamicAdmin;
      
      setIsSuperAdmin(isSuper);
      setIsAdmin(hasAdminRights);
      if (hasAdminRights) setSessionStartTime(prev => prev || Date.now());
    } else {
      setIsSuperAdmin(false);
      setIsAdmin(false);
      setSessionStartTime(null);
    }
  }, [user, adminsList]);

  // Bộ đếm Hết hạn phiên (4 giờ)
  useEffect(() => {
    if (isAdmin && sessionStartTime) {
      const checkSession = () => {
        const hoursElapsed = (Date.now() - sessionStartTime) / (1000 * 60 * 60);
        if (hoursElapsed >= 4) {
          handleAdminLogout();
          showAlert('Hết hạn phiên', 'Phiên đăng nhập quản trị đã hết hạn (4 giờ). Vui lòng đăng nhập lại để đảm bảo an toàn.');
        }
      };

      checkSession();
      const interval = setInterval(checkSession, 60000); 
      return () => clearInterval(interval);
    }
  }, [isAdmin, sessionStartTime]);

  useEffect(() => {
    if (view === 'admin' && !isAdmin) {
      setView('form');
    }
  }, [view, isAdmin]);

  const MAX_PER_SLOT = 10;
  const SLOTS = ['9:00', '9:30', '10:00', '15:00', '15:30', '16:00', '16:30'];

  const todayRegistrations = useMemo(() => {
    return registrations.filter(reg => reg.date === selectedDate);
  }, [registrations, selectedDate]);

  const slotCounts = useMemo(() => {
    const counts = {};
    SLOTS.forEach(s => counts[s] = 0);
    todayRegistrations.forEach(reg => {
      if (counts[reg.slot] !== undefined) counts[reg.slot]++;
    });
    return counts;
  }, [todayRegistrations]);

  // Logic Xử lý Dữ liệu Biểu đồ (Ngày / Tuần / Tháng)
  const chartData = useMemo(() => {
    if (chartType === 'day') {
      return SLOTS.map(slot => ({
        label: slot,
        count: registrations.filter(r => r.date === selectedDate && r.slot === slot).length,
        max: Math.max(MAX_PER_SLOT, ...SLOTS.map(s => registrations.filter(r => r.date === selectedDate && r.slot === s).length)) || MAX_PER_SLOT
      }));
    } else if (chartType === 'week') {
      const curr = parseDateSafe(selectedDate);
      let dayOfWeek = curr.getDay(); // 0 là CN, 1 là T2
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      curr.setDate(curr.getDate() + diffToMonday); // Lui về Thứ 2 của tuần đó
      
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
      const maxVal = Math.max(...days.map(d => d.count), 10); // Lấy cột cao nhất làm chuẩn
      return days.map(d => ({ ...d, max: maxVal }));
    } else if (chartType === 'month') {
      const curr = parseDateSafe(selectedDate);
      const year = curr.getFullYear();
      const month = curr.getMonth();
      const numDays = new Date(year, month + 1, 0).getDate(); // Số ngày trong tháng
      const days = [];
      for (let i = 1; i <= numDays; i++) {
        const dString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        days.push({
          label: String(i),
          count: registrations.filter(r => r.date === dString).length,
        });
      }
      const maxVal = Math.max(...days.map(d => d.count), 10);
      return days.map(d => ({ ...d, max: maxVal }));
    }
    return [];
  }, [chartType, selectedDate, registrations]);

  // Đăng nhập Admin
  const handleAdminLogin = async () => {
    if (isLoggingIn) return;
    try {
      if (window.self !== window.top) {
        showAlert(
          "Cần mở tab mới để đăng nhập",
          "Bạn đang xem trước trang web trong một khung thu nhỏ. Vì lý do bảo mật, Google chặn không cho hiển thị bảng đăng nhập tại đây.\n\n👉 Vui lòng mở trang web này ở một TAB MỚI (hoặc dùng đường link Vercel chính thức của bạn) để đăng nhập quản trị an toàn."
        );
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
        showAlert(
          "Không có quyền truy cập", 
          `Tài khoản "${email}" chưa được phân quyền quản trị.\n\nNếu bạn là nhân viên, vui lòng liên hệ Quản trị viên gốc để được cấp quyền.`
        );
        handleAdminLogout();
      }
    } catch (error) {
      if (error.code === 'auth/unauthorized-domain') {
        const currentDomain = window.location.hostname;
        showAlert('Lỗi Tên Miền Chưa Cấp Phép', `Tên miền "${currentDomain}" đang bị Firebase chặn đăng nhập.\n\nĐể sửa lỗi:\n1. Mở Firebase Console -> Authentication -> Settings -> Authorized domains.\n2. Thêm "${currentDomain}" vào danh sách.\n3. Lưu lại và thử đăng nhập lại.`);
      } else if (error.code === 'auth/operation-not-allowed') {
        showAlert('Chưa Bật Đăng Nhập Bằng Google', 'Bạn chưa kích hoạt phương thức đăng nhập này trên Firebase.\n\n👉 Cách sửa lỗi:\n1. Mở Firebase Console -> Authentication -> Sign-in method.\n2. Bấm "Add new provider" -> Chọn Google.\n3. Bật "Enable" (Cho phép).\n4. RẤT QUAN TRỌNG: Chọn "Project support email" (Email hỗ trợ dự án) rồi bấm Lưu (Save).');
      } else if (error.code === 'auth/popup-blocked') {
        showAlert('Trình duyệt chặn Pop-up', 'Trình duyệt của bạn đang chặn cửa sổ đăng nhập. Vui lòng nhìn lên thanh địa chỉ (góc trên bên phải), bấm vào biểu tượng cảnh báo và chọn "Luôn cho phép cửa sổ bật lên" (Always allow pop-ups) cho trang web này.');
      } else if (error.code !== 'auth/popup-closed-by-user') {
        showAlert('Lỗi Đăng Nhập', `Hệ thống báo lỗi: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    await signOut(auth);
    localStorage.removeItem('adminLoginTime'); 
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
    } else {
        await signInAnonymously(auth);
    }
    setView('form');
  };

  const exportToExcel = () => {
    const headers = ['Giờ', 'Họ Tên', 'Số Điện Thoại', 'Đại Lý', 'Ngày Đăng Ký'];
    const rows = [...todayRegistrations]
      .sort((a,b) => a.slot.localeCompare(b.slot))
      .map(reg => [
        reg.slot,
        `"${reg.name}"`, 
        `"${reg.phone}"`,
        `"${reg.agency}"`,
        reg.date.split('-').reverse().join('/')
      ]);

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    
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
        name: name.trim(),
        phone: phone.trim(),
        agency: agency.trim(),
        date: selectedDate,
        slot: selectedSlot,
        timestamp: serverTimestamp(),
        userId: user.uid
      });
      setSubmitStatus({ loading: false, success: true, error: null });
      setName(''); setPhone(''); setAgency(''); setSelectedSlot('');
      setTimeout(() => setSubmitStatus(prev => ({ ...prev, success: false })), 4000);
    } catch (error) {
      setSubmitStatus({ loading: false, success: false, error: 'Có lỗi xảy ra khi gửi đăng ký.' });
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
      
      {/* MODAL */}
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
                <button onClick={closeModal} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm font-bold transition-colors">
                  Hủy
                </button>
              )}
              <button 
                onClick={() => { if (modal.onConfirm) modal.onConfirm(); closeModal(); }}
                className={`px-5 py-2.5 text-white rounded-xl text-sm font-bold shadow-md transition-colors ${modal.type === 'confirm' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'}`}
              >
                {modal.type === 'confirm' ? 'Xác nhận Xóa' : 'Đã hiểu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navbar */}
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
              style={{ backgroundImage: "url('https://scontent.fsgn22-1.fna.fbcdn.net/v/t39.30808-6/660431692_122180502596789445_5003665343564458581_n.jpg?_nc_cat=107&ccb=1-7&_nc_sid=2a1932&_nc_ohc=jHjZgb04H28Q7kNvwH2hVPa&_nc_oc=AdoCgaIW2wuSOFyFC2M_KDfBiMK3woHbmlzmTOpXqYuF0nT6oMKa7a9-cFTwI_IKvto&_nc_zt=23&_nc_ht=scontent.fsgn22-1.fna&_nc_gid=tYYixgtD1TRQzDBPTgvrWA&_nc_ss=7a3a8&oh=00_Af3O2D0YVnYMtzb0WXspl18l-Tpxtx1LZnpafIhoesQGhw&oe=69D745BB')" }}
            >
              <div className="absolute inset-0 bg-gradient-to-b from-orange-900/90 to-orange-800/80"></div>
              <div className="relative z-10 text-white">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight">ĐĂNG KÝ THAM QUAN CÔNG TRƯỜNG</h2>
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
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">1. Chọn ngày tham quan</label>
                  <div className="relative">
                    <div className="w-full px-4 py-3 border-2 border-gray-100 rounded-2xl bg-gray-50 text-gray-700 text-sm font-medium flex justify-between items-center pointer-events-none">
                      <span>{selectedDate.split('-').reverse().join('/')}</span>
                      <Calendar className="h-5 w-5 text-gray-400" />
                    </div>
                    <input 
                      type="date" 
                      min={today} 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)} 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer block box-border" 
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">2. Chọn khung giờ</label>
                  <div className="grid grid-cols-3 gap-2">
                    {SLOTS.map(slot => {
                      const isFull = slotCounts[slot] >= MAX_PER_SLOT;
                      const isSelected = selectedSlot === slot;
                      return (
                        <button 
                          key={slot} 
                          type="button" 
                          disabled={isFull}
                          onClick={() => setSelectedSlot(slot)} 
                          className={`py-3 px-1 text-xs font-bold rounded-xl border-2 transition-all flex flex-col items-center justify-center ${
                            isFull 
                              ? 'bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed' 
                              : isSelected 
                                ? 'bg-orange-600 border-orange-600 text-white shadow-lg shadow-orange-200 scale-105' 
                                : 'bg-white border-gray-100 text-gray-600 hover:border-orange-200'
                          }`}
                        >
                          <span>{slot}</span>
                          <span className={`text-[9px] mt-1 font-normal ${isSelected ? 'text-orange-100' : 'text-gray-400'}`}>
                            {isFull ? 'Kín' : `Còn ${MAX_PER_SLOT - slotCounts[slot]}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">3. Thông tin cá nhân</label>
                  <div className="space-y-3">
                    <input type="text" placeholder="Họ và tên của bạn" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-orange-500 focus:bg-white outline-none transition-all text-sm" required />
                    <input type="tel" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-orange-500 focus:bg-white outline-none transition-all text-sm" required />
                    <input type="text" placeholder="Tên Đại lý" value={agency} onChange={(e) => setAgency(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-orange-500 focus:bg-white outline-none transition-all text-sm" required />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={submitStatus.loading || !isFormValid} 
                  className={`w-full py-4 rounded-2xl font-bold transition-all ${
                    isFormValid && !submitStatus.loading 
                      ? 'bg-orange-600 hover:bg-orange-700 active:scale-95 text-white shadow-xl shadow-orange-200' 
                      : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                  }`}
                >
                  {submitStatus.loading ? "ĐANG GỬI..." : "XÁC NHẬN ĐĂNG KÝ"}
                </button>
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
                    
                    {/* TRÁNG GƯƠNG NGÀY CHO ADMIN: HIỂN THỊ DD/MM/YYYY NHƯNG GIỮ NGUYÊN CHỨC NĂNG CHỌN NGÀY */}
                    <div className="relative flex-1 sm:w-40">
                      <div className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs font-medium flex justify-between items-center pointer-events-none">
                        <span>{selectedDate.split('-').reverse().join('/')}</span>
                        <Calendar className="h-4 w-4 text-gray-400" />
                      </div>
                      <input 
                        type="date" 
                        value={selectedDate} 
                        onChange={(e) => setSelectedDate(e.target.value)} 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer block box-border" 
                      />
                    </div>
                    
                    <button onClick={exportToExcel} className="bg-green-600 hover:bg-green-500 text-white px-3 py-2 rounded-lg flex items-center justify-center text-xs font-bold transition-colors shadow-sm">
                      <Download className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">Xuất Excel</span>
                    </button>
                  </div>
                </div>
                
                <div className="p-5 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
                    <h3 className="text-xs font-bold text-gray-500 uppercase flex items-center">
                      <BarChart3 className="h-4 w-4 mr-1.5" /> Biểu đồ lượng khách
                    </h3>
                    
                    {/* BỘ LỌC BIỂU ĐỒ: NGÀY/TUẦN/THÁNG */}
                    <div className="flex bg-gray-200 p-0.5 rounded-lg w-full sm:w-auto">
                      <button onClick={() => setChartType('day')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${chartType === 'day' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>Ngày</button>
                      <button onClick={() => setChartType('week')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${chartType === 'week' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>Tuần</button>
                      <button onClick={() => setChartType('month')} className={`flex-1 sm:flex-none px-3 py-1.5 text-[10px] font-bold rounded-md transition-all ${chartType === 'month' ? 'bg-white shadow text-orange-600' : 'text-gray-500 hover:text-gray-700'}`}>Tháng</button>
                    </div>
                  </div>

                  <div className="flex items-end gap-1 sm:gap-2 h-32 px-1 overflow-x-auto min-w-full pb-2">
                    {chartData.map((item, idx) => {
                      const heightPercent = item.max > 0 ? (item.count / item.max) * 100 : 0;
                      // Đổi màu cột nếu đầy (áp dụng riêng cho biểu đồ Ngày)
                      const isFullSlot = chartType === 'day' && item.count >= MAX_PER_SLOT;
                      return (
                        <div key={idx} className="flex-1 min-w-[20px] flex flex-col items-center justify-end h-full group">
                          <span className="text-[10px] font-bold text-gray-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">{item.count}</span>
                          <div className="w-full max-w-[24px] bg-gray-200 rounded-t-sm relative flex justify-center items-end" style={{ height: '100%' }}>
                            <div 
                              className={`w-full rounded-t-sm transition-all duration-700 ${isFullSlot ? 'bg-red-500' : 'bg-orange-500'}`} 
                              style={{ height: `${heightPercent}%` }}
                            ></div>
                          </div>
                          <span className="text-[8px] sm:text-[9px] text-gray-600 mt-1.5 font-medium whitespace-nowrap">{item.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-white text-gray-500 border-b">
                        <th className="p-4 font-medium uppercase text-[10px]">Giờ</th>
                        <th className="p-4 font-medium uppercase text-[10px]">Tên</th>
                        <th className="p-4 font-medium uppercase text-[10px]">SĐT</th>
                        <th className="p-4 font-medium uppercase text-[10px]">Đại lý</th>
                        {/* ẨN cột XÓA nếu là nhân viên bình thường */}
                        {isSuperAdmin && <th className="p-4 text-right uppercase text-[10px]">Xóa</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {todayRegistrations.length === 0 ? (
                        <tr><td colSpan={isSuperAdmin ? "5" : "4"} className="p-10 text-center text-gray-400">Không có đăng ký nào trong ngày này</td></tr>
                      ) : (
                        [...todayRegistrations].sort((a,b) => a.slot.localeCompare(b.slot)).map(reg => (
                          <tr key={reg.id} className="hover:bg-orange-50/50 transition-colors">
                            <td className="p-4 font-bold text-orange-600">{reg.slot}</td>
                            <td className="p-4 font-medium text-gray-800">{reg.name}</td>
                            <td className="p-4 text-gray-600">{reg.phone}</td>
                            <td className="p-4 text-gray-500 italic">{reg.agency}</td>
                            
                            {/* CHỈ SUPER ADMIN MỚI THẤY NÚT XÓA */}
                            {isSuperAdmin && (
                              <td className="p-4 text-right">
                                <button onClick={() => handleDelete(reg.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="h-4 w-4"/></button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
             
             {/* CHỈ SUPER ADMIN MỚI ĐƯỢC XEM/SỬA PHẦN PHÂN QUYỀN NÀY */}
             {isSuperAdmin && (
               <div className="bg-white p-6 rounded-3xl shadow-xl border border-gray-100">
                  <h3 className="font-bold flex items-center text-gray-800 mb-4">
                    <Shield className="mr-2 h-5 w-5 text-indigo-500"/> Quản lý Admin (Dành riêng cho bạn)
                  </h3>
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