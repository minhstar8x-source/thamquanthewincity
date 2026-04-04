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
// ==========================================
const SUPER_ADMIN_EMAILS = [
  'minhpv@thangloigroup.vn' // Thay Gmail của bạn vào đây
];

// Hàm bổ trợ lấy ngày định dạng YYYY-MM-DD theo múi giờ Việt Nam
const getVietnamDateString = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [adminsList, setAdminsList] = useState([]); 
  const [view, setView] = useState('form'); 
  
  // Lấy ngày hiện tại theo múi giờ Việt Nam
  const today = useMemo(() => getVietnamDateString(), []);
  
  const [selectedDate, setSelectedDate] = useState(today);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [agency, setAgency] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [submitStatus, setSubmitStatus] = useState({ loading: false, success: false, error: null });
  const [newAdminEmail, setNewAdminEmail] = useState('');

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
      setIsAdmin(isSuper || isDynamicAdmin);
    } else {
      setIsAdmin(false);
    }
  }, [user, adminsList]);

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

  const handleAdminLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code === 'auth/unauthorized-domain') {
        alert("LỖI: Bạn cần thêm tên miền này vào mục 'Authorized domains' trong Firebase Console.");
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !name.trim() || !phone.trim() || !agency.trim() || !selectedSlot) return;
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
      setName(''); setPhone(''); setAgency('');
      setTimeout(() => setSubmitStatus(prev => ({ ...prev, success: false })), 4000);
    } catch (error) {
      setSubmitStatus({ loading: false, success: false, error: 'Có lỗi xảy ra khi gửi đăng ký.' });
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin || !window.confirm("Xóa đăng ký này?")) return;
    try {
      const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'registrations', id);
      await deleteDoc(docPath);
    } catch (error) { console.error(error); }
  };

  if (!user) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-100 text-gray-800 font-sans selection:bg-blue-100 overflow-x-hidden">
      {/* Navbar */}
      <nav className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 flex justify-between h-14 items-center">
          <div className="flex items-center font-bold text-lg text-blue-700 truncate mr-2">
            <Calendar className="mr-2 h-5 w-5 flex-shrink-0"/>
            <span className="truncate">The Win City</span>
          </div>
          <div className="flex space-x-1 sm:space-x-2">
            <button onClick={() => setView('form')} className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'form' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>Đăng ký</button>
            {isAdmin && <button onClick={() => setView('admin')} className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${view === 'admin' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>Admin</button>}
            {isAdmin ? <button onClick={handleAdminLogout} className="text-red-500 px-2 py-1.5 text-xs font-medium hover:bg-red-50 rounded-md">Thoát</button> : <button onClick={handleAdminLogin} className="text-gray-400 px-2 py-1.5 text-xs font-medium hover:bg-gray-100 rounded-md">Quản trị</button>}
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
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-black/40"></div>
              <div className="relative z-10 text-white">
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight">Tham Quan Công Trường</h2>
                <div className="h-1 w-12 bg-blue-400 mx-auto my-3 rounded-full"></div>
                <p className="text-xs sm:text-sm text-blue-100 font-medium italic">Vui lòng đăng ký trước để chúng tôi đón tiếp tốt nhất</p>
              </div>
            </div>

            <div className="px-4 py-6 sm:p-8 space-y-6">
              {submitStatus.success && (
                <div className="p-4 bg-green-50 border border-green-200 text-green-700 rounded-xl flex items-center animate-bounce">
                  <CheckCircle className="mr-2 h-5 w-5 flex-shrink-0"/> Đăng ký thành công!
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Chọn Ngày - Đã fix lỗi bị cắt trên mobile */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">1. Chọn ngày tham quan</label>
                  <div className="w-full">
                    <input 
                      type="date" 
                      min={today} 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)} 
                      className="w-full px-3 py-3 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm block box-border" 
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
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 scale-105' 
                                : 'bg-white border-gray-100 text-gray-600 hover:border-blue-200'
                          }`}
                        >
                          <span>{slot}</span>
                          <span className={`text-[9px] mt-1 font-normal ${isSelected ? 'text-blue-100' : 'text-gray-400'}`}>
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
                    <input type="text" placeholder="Họ và tên của bạn" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm" required />
                    <input type="tel" placeholder="Số điện thoại" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm" required />
                    <input type="text" placeholder="Tên đại lý (nếu có)" value={agency} onChange={(e) => setAgency(e.target.value)} className="w-full p-3.5 border-2 border-gray-100 rounded-2xl bg-gray-50 focus:border-blue-500 focus:bg-white outline-none transition-all text-sm" required />
                  </div>
                </div>

                <button 
                  type="submit" 
                  disabled={submitStatus.loading || !selectedSlot} 
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white py-4 rounded-2xl font-bold shadow-xl shadow-blue-200 transition-all disabled:opacity-50"
                >
                  {submitStatus.loading ? "ĐANG GỬI..." : "XÁC NHẬN ĐĂNG KÝ"}
                </button>
              </form>
            </div>
          </div>
        )}

        {view === 'admin' && isAdmin && (
          <div className="space-y-4">
             <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100">
                <div className="bg-gray-900 p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                  <h2 className="text-white font-bold flex items-center"><LayoutDashboard className="mr-2 h-5 w-5"/> Bảng Thống Kê</h2>
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-gray-800 text-white text-xs p-2 rounded-lg border-none focus:ring-1 focus:ring-blue-500 outline-none" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 border-b">
                        <th className="p-3 font-medium uppercase text-[10px]">Giờ</th>
                        <th className="p-3 font-medium uppercase text-[10px]">Tên</th>
                        <th className="p-3 font-medium uppercase text-[10px]">SĐT</th>
                        <th className="p-3 font-medium uppercase text-[10px]">Đại lý</th>
                        <th className="p-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {todayRegistrations.length === 0 ? (
                        <tr><td colSpan="5" className="p-10 text-center text-gray-400">Không có dữ liệu</td></tr>
                      ) : (
                        todayRegistrations.sort((a,b) => a.slot.localeCompare(b.slot)).map(reg => (
                          <tr key={reg.id} className="hover:bg-blue-50/50">
                            <td className="p-3 font-bold text-blue-600">{reg.slot}</td>
                            <td className="p-3 font-medium">{reg.name}</td>
                            <td className="p-3 text-gray-600">{reg.phone}</td>
                            <td className="p-3 text-gray-500 italic">{reg.agency}</td>
                            <td className="p-3 text-right">
                               <button onClick={() => handleDelete(reg.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4"/></button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
             </div>
             
             <div className="bg-white p-5 rounded-3xl shadow-xl border border-gray-100">
                <h3 className="font-bold flex items-center text-gray-800 mb-4"><Shield className="mr-2 h-5 w-5 text-indigo-500"/> Cấp quyền Admin mới</h3>
                <form onSubmit={async (e) => {
                  e.preventDefault();
                  if(!newAdminEmail.trim()) return;
                  const adminPath = collection(db, 'artifacts', appId, 'public', 'data', 'admins');
                  await addDoc(adminPath, { email: newAdminEmail.trim().toLowerCase(), timestamp: serverTimestamp() });
                  setNewAdminEmail('');
                  alert("Đã cấp quyền thành công!");
                }} className="flex gap-2">
                  <input type="email" placeholder="Gmail nhân viên..." value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} className="flex-1 p-3 bg-gray-50 border border-gray-100 rounded-2xl outline-none focus:border-indigo-400 text-sm" required />
                  <button type="submit" className="bg-indigo-600 text-white px-4 py-3 rounded-2xl text-sm font-bold">THÊM</button>
                </form>
                <div className="mt-4 space-y-2">
                  {adminsList.map(ad => (
                    <div key={ad.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <span className="text-xs text-gray-600">{ad.email}</span>
                      <button onClick={async () => {
                         if(!window.confirm("Thu hồi quyền?")) return;
                         await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'admins', ad.id));
                      }} className="text-red-400 text-xs font-bold">XÓA</button>
                    </div>
                  ))}
                </div>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}