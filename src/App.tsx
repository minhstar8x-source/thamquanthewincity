import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from 'firebase/firestore';
import { Calendar, Clock, Users, User, Phone, CheckCircle, AlertCircle, Trash2, LayoutDashboard, ClipboardList, Building, LogIn, LogOut, Shield, ShieldAlert } from 'lucide-react';

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
// Email này có quyền tối cao, không thể bị xóa khỏi hệ thống
// ==========================================
const SUPER_ADMIN_EMAILS = [
  'minhstar8x@gmail.com' 
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [adminsList, setAdminsList] = useState([]); // Danh sách admin từ database
  const [view, setView] = useState('form'); 
  
  // --- Form State ---
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agency, setAgency] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitStatus, setSubmitStatus] = useState({ loading: false, success: false, error: null });
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // --- Auth Effect ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Lỗi xác thực mặc định:", error);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // --- Lấy dữ liệu từ Firestore (Đăng ký & Phân quyền) ---
  useEffect(() => {
    if (!user) return;

    // Tải danh sách đăng ký
    const regPath = collection(db, 'artifacts', appId, 'public', 'data', 'registrations'); 
    const unsubReg = onSnapshot(regPath, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRegistrations(data);
    });

    // Tải danh sách Admin được phân quyền động
    const adminPath = collection(db, 'artifacts', appId, 'public', 'data', 'admins');
    const unsubAdmin = onSnapshot(adminPath, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAdminsList(data);
    });

    return () => {
      unsubReg();
      unsubAdmin();
    };
  }, [user]);

  // --- Logic kiểm tra Quyền Quản Trị ---
  useEffect(() => {
    if (user?.email) {
      // User là admin nếu nằm trong list gốc HOẶC có tên trong database
      const isSuper = SUPER_ADMIN_EMAILS.includes(user.email);
      const isDynamicAdmin = adminsList.some(a => a.email === user.email);
      setIsAdmin(isSuper || isDynamicAdmin);
    } else {
      setIsAdmin(false);
    }
  }, [user, adminsList]);

  // Đẩy người dùng về form nếu mất quyền
  useEffect(() => {
    if (view === 'admin' && !isAdmin) {
      setView('form');
    }
  }, [view, isAdmin]);

  // --- Cấu hình Khung Giờ & Logic ---
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

  const isDayFull = SLOTS.every(slot => slotCounts[slot] >= MAX_PER_SLOT);

  useEffect(() => {
    if (isDayFull) {
      setSelectedSlot('');
    } else {
      if (!selectedSlot || slotCounts[selectedSlot] >= MAX_PER_SLOT) {
        const firstAvailable = SLOTS.find(slot => slotCounts[slot] < MAX_PER_SLOT);
        if (firstAvailable) setSelectedSlot(firstAvailable);
      }
    }
  }, [selectedDate, isDayFull, slotCounts, selectedSlot]);


  // --- Xử lý sự kiện Tài Khoản ---
  const handleAdminLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const email = result.user.email;
      
      // Chờ một chút để logic check admin chạy, nếu không phải admin thì log out
      setTimeout(async () => {
        // Cần lấy latest state, nhưng ta có thể check thủ công ngay đây
        const isSuper = SUPER_ADMIN_EMAILS.includes(email);
        const isDynamic = adminsList.some(a => a.email === email);
        
        if (!isSuper && !isDynamic) {
          alert(`Tài khoản ${email} chưa được cấp quyền quản trị!`);
          await signOut(auth);
          if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
          } else {
            await signInAnonymously(auth);
          }
        }
      }, 500);

    } catch (error) {
      console.error("Lỗi đăng nhập:", error);
      // Xử lý lỗi Unauthorized Domain hiển thị cho người dùng dễ hiểu
      if (error.code === 'auth/unauthorized-domain') {
        alert(`LỖI TÊN MIỀN CHƯA ĐƯỢC CẤP PHÉP\n\nĐể sửa lỗi này:\n1. Mở Firebase Console -> Authentication -> tab Settings (Cài đặt).\n2. Chọn 'Authorized domains' (Miền được ủy quyền).\n3. Bấm 'Add domain' và dán đường link web của bạn vào (ví dụ: tên-app.stackblitz.io).\n4. Lưu lại và thử đăng nhập lại.`);
      } else if (error.code === 'auth/popup-closed-by-user') {
        // Bỏ qua nếu người dùng tự đóng popup
      } else {
        alert("Đăng nhập thất bại. Vui lòng kiểm tra lại cấu hình Firebase.");
      }
    }
  };

  const handleAdminLogout = async () => {
    await signOut(auth);
    if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
      await signInWithCustomToken(auth, __initial_auth_token);
    } else {
      await signInAnonymously(auth);
    }
    setView('form');
  };

  // --- Phân Quyền (Admins) ---
  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!isAdmin || !newAdminEmail.trim()) return;

    const emailToAdd = newAdminEmail.trim().toLowerCase();

    // Check trùng lặp
    if (SUPER_ADMIN_EMAILS.includes(emailToAdd) || adminsList.some(a => a.email === emailToAdd)) {
      alert("Email này đã có quyền quản trị rồi!");
      return;
    }

    try {
      const adminPath = collection(db, 'artifacts', appId, 'public', 'data', 'admins');
      await addDoc(adminPath, {
        email: emailToAdd,
        addedBy: user.email,
        timestamp: serverTimestamp()
      });
      setNewAdminEmail('');
      alert(`Đã cấp quyền thành công cho ${emailToAdd}`);
    } catch (error) {
      console.error("Lỗi thêm admin:", error);
      alert("Có lỗi xảy ra, không thể cấp quyền.");
    }
  };

  const handleRemoveAdmin = async (id, email) => {
    if (!isAdmin) return;
    if (email === user.email) {
      alert("Bạn không thể tự xóa quyền của chính mình tại đây!");
      return;
    }
    if (!window.confirm(`Thu hồi quyền quản trị của ${email}?`)) return;

    try {
      const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'admins', id);
      await deleteDoc(docPath);
    } catch (error) {
      console.error("Lỗi xóa admin:", error);
      alert("Không thể thu hồi quyền, vui lòng thử lại.");
    }
  };

  // --- Submit Đăng Ký ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !name.trim() || !phone.trim() || !agency.trim() || !selectedSlot) return;

    if (slotCounts[selectedSlot] >= MAX_PER_SLOT) {
      setSubmitStatus({ loading: false, success: false, error: 'Khung giờ này vừa đầy. Vui lòng chọn giờ khác.' });
      return;
    }

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
      setName('');
      setPhone('');
      setAgency('');
      
      setTimeout(() => {
        setSubmitStatus(prev => ({ ...prev, success: false }));
      }, 4000);

    } catch (error) {
      console.error("Lỗi khi gửi:", error);
      setSubmitStatus({ loading: false, success: false, error: 'Có lỗi xảy ra, thử lại sau.' });
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin || !window.confirm("Bạn muốn xóa đăng ký này?")) return;
    try {
      const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'registrations', id);
      await deleteDoc(docPath);
    } catch (error) {
      console.error("Lỗi xóa:", error);
    }
  };

  // --- Giao diện (UI) ---
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">
      {/* Navbar */}
      <nav className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Calendar className="h-6 w-6 text-blue-600 mr-2" />
              <span className="font-bold text-xl text-gray-900 hidden sm:inline-block">The Win City</span>
            </div>
            <div className="flex items-center space-x-2 sm:space-x-4 overflow-x-auto">
              <button 
                onClick={() => setView('form')}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${view === 'form' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <ClipboardList className="h-4 w-4 mr-1.5" />
                Đăng ký
              </button>
              
              {isAdmin && (
                <button 
                  onClick={() => setView('admin')}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${view === 'admin' ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <LayoutDashboard className="h-4 w-4 mr-1.5" />
                  Bảng theo dõi
                </button>
              )}

              {isAdmin ? (
                <button 
                  onClick={handleAdminLogout}
                  className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                  title={user.email}
                >
                  <LogOut className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline-block">Đăng xuất</span>
                </button>
              ) : (
                <button 
                  onClick={handleAdminLogin}
                  className="flex items-center px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors whitespace-nowrap"
                >
                  <LogIn className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden sm:inline-block">Quản trị</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* VIEW: KHÁCH HÀNG ĐĂNG KÝ */}
        {view === 'form' && (
          <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
            
            {/* --- PHẦN TIÊU ĐỀ CÓ LOGO VÀ HÌNH NỀN --- */}
            <div 
              className="relative px-6 py-10 text-center bg-cover bg-center"
              style={{ backgroundImage: "url('https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop')" }}
            >
              {/* Lớp phủ màu xanh đen trong suốt để giữ cho chữ và logo luôn nổi bật dễ đọc */}
              <div className="absolute inset-0 bg-blue-900/75"></div>
              
              <div className="relative z-10 flex flex-col items-center">
                {/* Logo dự án */}
                <img 
                  src="https://thewincity.vn/wp-content/uploads/2025/11/header-logo.svg" 
                  alt="Logo The Win City" 
                  className="h-14 object-contain mb-4 rounded-md shadow-sm bg-white p-1.5"
                />
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 drop-shadow-md">ĐĂNG KÝ THAM QUAN<br/>CÔNG TRƯỜNG THE WIN CITY</h2>
                <p className="text-blue-50 text-sm mt-2 drop-shadow">Vui lòng chọn ngày và khung giờ phù hợp</p>
              </div>
            </div>
            {/* --------------------------------------- */}

            <div className="p-6 sm:p-8">
              {submitStatus.success && (
                <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm font-medium text-green-800">Đăng ký thành công!</h3>
                    <p className="text-sm text-green-600 mt-1">Hẹn gặp bạn vào lúc {selectedSlot} ngày {selectedDate.split('-').reverse().join('/')}.</p>
                  </div>
                </div>
              )}

              {submitStatus.error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
                  <p className="text-sm text-red-700 font-medium">{submitStatus.error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Chọn ngày đăng ký</label>
                  <input 
                    type="date" 
                    min={today}
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                  />
                </div>

                {isDayFull ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
                    <Users className="h-8 w-8 text-amber-500 mx-auto mb-3" />
                    <h3 className="text-lg font-semibold text-amber-800 mb-1">Đã kín lịch hôm nay</h3>
                    <p className="text-sm text-amber-600">Rất tiếc, tất cả các khung giờ trong ngày {selectedDate.split('-').reverse().join('/')} đều đã đủ người. Vui lòng chọn ngày khác.</p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Chọn khung giờ</label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {SLOTS.map((slot) => {
                          const isFull = slotCounts[slot] >= MAX_PER_SLOT;
                          return (
                            <label key={slot} className={`relative flex flex-col p-2 cursor-pointer rounded-lg border-2 transition-all ${
                              isFull 
                                ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed' 
                                : selectedSlot === slot
                                  ? 'border-blue-600 bg-blue-50'
                                  : 'border-gray-200 hover:border-blue-200'
                            }`}>
                              <input 
                                type="radio" 
                                name="slot" 
                                value={slot} 
                                checked={selectedSlot === slot}
                                onChange={() => setSelectedSlot(slot)}
                                disabled={isFull}
                                className="sr-only"
                              />
                              <div className="flex items-center justify-center sm:justify-between flex-wrap gap-1 mb-1">
                                <span className={`text-base font-bold ${isFull ? 'text-gray-400' : 'text-blue-700'}`}>{slot}</span>
                                {isFull && <span className="text-[10px] font-medium text-red-500 bg-red-100 px-1 py-0.5 rounded-md">Đầy</span>}
                              </div>
                              <div className="mt-auto border-t border-gray-200 pt-1 text-center sm:text-left">
                                <span className="text-[11px] text-gray-500">
                                  Còn {Math.max(0, MAX_PER_SLOT - slotCounts[slot])}/{MAX_PER_SLOT}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <User className="h-5 w-5 text-gray-400" />
                          </div>
                          <input 
                            type="text" 
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Tên của bạn"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Phone className="h-5 w-5 text-gray-400" />
                          </div>
                          <input 
                            type="tel" 
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="SĐT liên hệ"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Đại lý</label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Building className="h-5 w-5 text-gray-400" />
                          </div>
                          <input 
                            type="text" 
                            value={agency}
                            onChange={(e) => setAgency(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="Tên đại lý (nếu có)"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      type="submit" 
                      disabled={submitStatus.loading || !selectedSlot}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all disabled:opacity-50"
                    >
                      {submitStatus.loading ? "Đang xử lý..." : "Xác Nhận Đăng Ký"}
                    </button>
                  </>
                )}
              </form>
            </div>
          </div>
        )}

        {/* VIEW: QUẢN TRỊ VIÊN THEO DÕI */}
        {view === 'admin' && isAdmin && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
              <div className="bg-gray-800 px-6 py-5 flex flex-col sm:flex-row justify-between items-center gap-4">
                <h2 className="text-xl font-bold text-white flex items-center">
                  <LayoutDashboard className="h-5 w-5 mr-2" />
                  Bảng Thống Kê
                </h2>
                
                <div className="flex items-center bg-gray-700 rounded-lg p-1">
                  <span className="text-gray-300 text-sm px-3">Ngày:</span>
                  <input 
                    type="date" 
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-gray-600 text-white border-none rounded text-sm py-1.5 px-3 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Thống kê ca */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-8 gap-2 p-4 bg-gray-50 border-b border-gray-100 overflow-x-auto">
                {SLOTS.map((slot) => (
                  <div key={slot} className="bg-white p-2 rounded-lg shadow-sm border border-gray-200 text-center min-w-[60px]">
                    <p className="text-[11px] text-gray-500 font-medium">{slot}</p>
                    <p className="text-base font-bold text-gray-900">{slotCounts[slot]} <span className="text-[9px] text-gray-400">/ 10</span></p>
                  </div>
                ))}
                <div className="bg-green-50 p-2 rounded-lg shadow-sm border border-green-200 text-center min-w-[60px]">
                  <p className="text-[11px] text-green-700 font-medium">Tổng</p>
                  <p className="text-base font-bold text-green-700">{todayRegistrations.length}</p>
                </div>
              </div>

              {/* Bảng dữ liệu */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-100 text-gray-600 text-sm uppercase tracking-wider">
                      <th className="p-4 font-medium border-b border-gray-200">Giờ</th>
                      <th className="p-4 font-medium border-b border-gray-200">Khách hàng</th>
                      <th className="p-4 font-medium border-b border-gray-200">Số điện thoại</th>
                      <th className="p-4 font-medium border-b border-gray-200">Đại lý</th>
                      <th className="p-4 font-medium border-b border-gray-200 text-right">Xóa</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {todayRegistrations.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-gray-500">
                          Chưa có khách đăng ký ngày {selectedDate.split('-').reverse().join('/')}
                        </td>
                      </tr>
                    ) : (
                      [...todayRegistrations]
                        .sort((a, b) => {
                          const timeA = a.slot.padStart(5, '0');
                          const timeB = b.slot.padStart(5, '0');
                          return timeA.localeCompare(timeB) || (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0);
                        })
                        .map((reg) => (
                        <tr key={reg.id} className="hover:bg-gray-50">
                          <td className="p-4">
                            <span className="px-2 py-1 bg-indigo-100 text-indigo-800 rounded-md text-xs font-bold">{reg.slot}</span>
                          </td>
                          <td className="p-4 font-medium text-gray-900">{reg.name}</td>
                          <td className="p-4 text-gray-600">{reg.phone}</td>
                          <td className="p-4 text-gray-600">{reg.agency}</td>
                          <td className="p-4 text-right">
                            <button 
                              onClick={() => handleDelete(reg.id)}
                              className="text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="h-5 w-5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* QUẢN LÝ PHÂN QUYỀN (CHỈ ADMIN THẤY) */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
              <div className="bg-indigo-600 px-6 py-4">
                <h2 className="text-lg font-bold text-white flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Cài Đặt Phân Quyền Quản Trị
                </h2>
              </div>
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  Thêm Gmail của nhân sự để cấp quyền xem Bảng Thống Kê. Chỉ những người có quyền mới xem được khu vực này.
                </p>
                
                {/* Form thêm admin */}
                <form onSubmit={handleAddAdmin} className="flex gap-3 mb-6">
                  <input 
                    type="email" 
                    value={newAdminEmail}
                    onChange={(e) => setNewAdminEmail(e.target.value)}
                    placeholder="Nhập địa chỉ Gmail..." 
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                  <button 
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap"
                  >
                    Cấp quyền
                  </button>
                </form>

                {/* Danh sách Admin */}
                <div className="bg-gray-50 rounded-lg border border-gray-200">
                  <ul className="divide-y divide-gray-200">
                    {/* Super Admin cố định */}
                    {SUPER_ADMIN_EMAILS.map((email, idx) => (
                      <li key={`super-${idx}`} className="p-4 flex items-center justify-between">
                        <div className="flex items-center">
                          <ShieldAlert className="h-4 w-4 text-amber-500 mr-2" />
                          <span className="font-medium text-gray-900">{email}</span>
                        </div>
                        <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-md">
                          Gốc
                        </span>
                      </li>
                    ))}
                    
                    {/* Admin thêm động */}
                    {adminsList.map(admin => (
                      <li key={admin.id} className="p-4 flex items-center justify-between hover:bg-gray-100 transition-colors">
                        <div className="flex items-center">
                          <User className="h-4 w-4 text-gray-400 mr-2" />
                          <span className="text-gray-700">{admin.email}</span>
                        </div>
                        <button 
                          onClick={() => handleRemoveAdmin(admin.id, admin.email)}
                          className="text-sm text-red-500 hover:text-red-700 font-medium"
                        >
                          Thu hồi
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}