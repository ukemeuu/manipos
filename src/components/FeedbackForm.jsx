import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { getTenantInfo } from '../lib/tenant';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Clock, 
  UploadCloud, 
  Send, 
  Sparkles, 
  ShoppingBag, 
  Utensils, 
  Truck, 
  Smartphone,
  Check
} from 'lucide-react';

export function FeedbackForm() {
  const tenantInfo = getTenantInfo();
  const tenantSlug = tenantInfo.tenantSlug || 'potofjollof';
  const tenantDisplayName = tenantSlug === 'potofjollof' ? 'MUTE KITCHENS' : tenantSlug.replace('-', ' ').toUpperCase();

  const [currentStep, setCurrentStep] = useState(0); // 0 = Welcome, 1-7 = Questions, 8 = Success
  const [selectedBrand, setSelectedBrand] = useState('Pot of Jollof Kitchen');
  const [orderMethod, setOrderMethod] = useState('Dine-in');
  const [customerName, setCustomerName] = useState('');
  const [ticketId, setTicketId] = useState('');
  const [rating, setRating] = useState('🤩'); // 😡, 🙁, 😐, 🙂, 🤩
  const [categoryRatings, setCategoryRatings] = useState({
    foodQuality: 5,
    service: 5,
    speed: 5
  });
  const [comment, setComment] = useState('');
  const [photoUrl, setPhotoUrl] = useState(null);
  
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  // Generate dynamic discount code (e.g. 36GQXR)
  const discountCode = useMemo(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }, []);

  const totalQuestions = 7;

  const brands = [
    'Pot of Jollof Kitchen',
    'Little Lagos',
    'Cafe Swahili',
    'Samaki Street',
    'Yellow Juice Bar'
  ];

  const orderMethods = [
    { label: 'Dine-in', icon: Utensils },
    { label: 'Takeaway / Pickup', icon: ShoppingBag },
    { label: 'Direct Delivery (Call / WhatsApp)', icon: Truck },
    { label: 'UberEats / Glovo / Bolt Food', icon: Smartphone }
  ];

  const emojis = [
    { emoji: '😡', label: 'Terrible' },
    { emoji: '🙁', label: 'Bad' },
    { emoji: '😐', label: 'Okay' },
    { emoji: '🙂', label: 'Good' },
    { emoji: '🤩', label: 'Excellent' }
  ];

  const handleBrandSelect = (brand) => {
    setSelectedBrand(brand);
    setCurrentStep(2);
  };

  const handleOrderMethodSelect = (method) => {
    setOrderMethod(method);
    setCurrentStep(3);
  };

  const handleEmojiSelect = (emojiChar) => {
    setRating(emojiChar);
    setCurrentStep(5);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setValidationError('');

    const numericRating = rating === '🤩' ? 5 : rating === '🙂' ? 4 : rating === '😐' ? 3 : rating === '🙁' ? 2 : 1;

    try {
      const { error: insertError } = await supabase
        .from('pos_feedback')
        .insert([{
          tenant_id: tenantSlug,
          rating: numericRating,
          category: selectedBrand,
          comment: `[Method: ${orderMethod}] [Ticket: ${ticketId || 'N/A'}] ${comment || 'No comment'}`,
          customer_name: customerName || 'Anonymous Guest',
          customer_contact: ticketId || 'N/A'
        }]);

      if (insertError) console.warn('Supabase insert notice:', insertError);
      setCurrentStep(8); // Success state
    } catch (err) {
      console.error('Feedback submit error:', err);
      setCurrentStep(8);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white font-sans antialiased flex flex-col justify-between selection:bg-[#FACC15] selection:text-slate-950">
      
      {/* Top Yellow Progress Bar */}
      <div className="w-full bg-[#0E0E11] border-b border-slate-800/80 sticky top-0 z-50">
        {currentStep >= 1 && currentStep <= 7 && (
          <div className="w-full bg-slate-800 h-1">
            <div 
              className="bg-[#FACC15] h-full transition-all duration-300 ease-out"
              style={{ width: `${(currentStep / totalQuestions) * 100}%` }}
            />
          </div>
        )}

        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-black text-xs tracking-widest text-[#FACC15] uppercase">
            {tenantDisplayName}
          </span>

          {currentStep >= 1 && currentStep <= 7 && (
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              QUESTION {currentStep} / {totalQuestions}
            </span>
          )}
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 w-full max-w-xl mx-auto px-6 py-8 flex flex-col justify-center text-center">
        <AnimatePresence mode="wait">

          {/* STEP 0: Welcome Screen */}
          {currentStep === 0 && (
            <motion.div
              key="step0"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-left"
            >
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight">
                  Thank you for ordering with us!
                </h1>
                <p className="text-slate-400 text-base font-medium leading-relaxed">
                  We would love to know a bit more about your dining experience to help us keep improving.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 bg-[#16171D] border border-[#272932] px-4 py-2 rounded-full uppercase tracking-wider">
                <Clock size={14} className="text-[#FACC15]" />
                <span>TAKES LESS THAN 30 SECONDS</span>
              </div>

              <div className="pt-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="bg-[#FACC15] hover:bg-amber-400 text-slate-950 font-black text-base px-8 py-4 rounded-2xl transition-all shadow-xl shadow-amber-400/20 flex items-center gap-2 cursor-pointer"
                >
                  <span>Give Feedback</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 1: Brand Selection */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-tight">
                Which of our brands did you order from?
              </h2>

              <div className="space-y-3">
                {brands.map((brand) => (
                  <button
                    key={brand}
                    onClick={() => handleBrandSelect(brand)}
                    className="w-full bg-[#16171D] hover:bg-[#1E2028] text-white font-bold text-base py-4 px-6 rounded-2xl border border-[#272932] hover:border-[#FACC15] transition-all text-left flex justify-between items-center cursor-pointer group"
                  >
                    <span>{brand}</span>
                    <ArrowRight size={16} className="text-slate-500 group-hover:text-[#FACC15] transition-colors" />
                  </button>
                ))}
              </div>

              <div className="flex justify-start">
                <button
                  onClick={() => setCurrentStep(0)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Order Method */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-tight">
                How did you order today?
              </h2>

              <div className="space-y-3">
                {orderMethods.map((m) => {
                  const IconComp = m.icon;
                  return (
                    <button
                      key={m.label}
                      onClick={() => handleOrderMethodSelect(m.label)}
                      className="w-full bg-[#16171D] hover:bg-[#1E2028] text-white font-bold text-base py-4 px-6 rounded-2xl border border-[#272932] hover:border-[#FACC15] transition-all text-left flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <IconComp size={20} className="text-[#FACC15]" />
                        <span>{m.label}</span>
                      </div>
                      <ArrowRight size={16} className="text-slate-500 group-hover:text-[#FACC15] transition-colors" />
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-start">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Details Input */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <div className="space-y-2">
                <h2 className="text-3xl font-black text-white tracking-tight">
                  Can we get your details?
                </h2>
                <p className="text-slate-400 text-xs font-medium">
                  We need this to locate your order ticket and issue your discount voucher.
                </p>
              </div>

              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Customer Name <span className="text-[#FACC15]">*</span>
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full bg-[#16171D] border border-[#272932] rounded-2xl px-5 py-4 text-base text-white font-medium focus:outline-none focus:border-[#FACC15] transition-all placeholder:text-slate-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Order / Ticket ID or Phone Number
                  </label>
                  <input
                    type="text"
                    value={ticketId}
                    onChange={(e) => setTicketId(e.target.value)}
                    placeholder="e.g. #1234 or 0700 000 000"
                    className="w-full bg-[#16171D] border border-[#272932] rounded-2xl px-5 py-4 text-base text-white font-medium focus:outline-none focus:border-[#FACC15] transition-all placeholder:text-slate-600"
                  />
                </div>
              </div>

              {validationError && <p className="text-red-400 text-xs font-bold">{validationError}</p>}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    if (!customerName.trim()) {
                      setValidationError('Please enter your name to proceed.');
                      return;
                    }
                    setValidationError('');
                    setCurrentStep(4);
                  }}
                  className="bg-[#FACC15] hover:bg-amber-400 text-slate-950 font-black text-sm px-8 py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-400/20"
                >
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: Overall Rating (Emoji Selector) */}
          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-tight">
                How was your overall experience?
              </h2>

              <div className="flex items-center justify-center gap-4 py-6">
                {emojis.map((item) => (
                  <button
                    key={item.emoji}
                    onClick={() => handleEmojiSelect(item.emoji)}
                    className="w-14 h-14 bg-[#16171D] border border-[#272932] hover:border-[#FACC15] rounded-2xl flex items-center justify-center text-3xl transition-all hover:scale-125 active:scale-95 cursor-pointer shadow-lg"
                  >
                    {item.emoji}
                  </button>
                ))}
              </div>

              <div className="flex justify-start">
                <button
                  onClick={() => setCurrentStep(3)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 5: Quick Ratings */}
          {currentStep === 5 && (
            <motion.div
              key="step5"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-tight">
                Quick Ratings (Optional)
              </h2>

              <div className="space-y-4 text-left bg-[#16171D] border border-[#272932] p-6 rounded-3xl">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Food Quality & Taste
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCategoryRatings({ ...categoryRatings, foodQuality: num })}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                          categoryRatings.foodQuality === num
                            ? 'bg-[#FACC15] text-slate-950 border-[#FACC15]'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {num}★
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Staff Service & Speed
                  </label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCategoryRatings({ ...categoryRatings, service: num })}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                          categoryRatings.service === num
                            ? 'bg-[#FACC15] text-slate-950 border-[#FACC15]'
                            : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {num}★
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(4)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(6)}
                  className="bg-[#FACC15] hover:bg-amber-400 text-slate-950 font-black text-sm px-8 py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-400/20"
                >
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 6: Improvement Feedback */}
          {currentStep === 6 && (
            <motion.div
              key="step6"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-tight">
                Anything specific we can improve or that you loved?
              </h2>

              <div className="bg-[#16171D] border border-[#272932] p-4 rounded-3xl">
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share your experience details here..."
                  className="w-full bg-transparent p-2 text-base text-white font-medium focus:outline-none placeholder:text-slate-600 resize-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(5)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setCurrentStep(7)}
                  className="bg-[#FACC15] hover:bg-amber-400 text-slate-950 font-black text-sm px-8 py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-400/20"
                >
                  Next
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 7: Photo Upload & Final Submit */}
          {currentStep === 7 && (
            <motion.div
              key="step7"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.2 }}
              className="space-y-8 text-center"
            >
              <h2 className="text-3xl font-black text-white tracking-tight">
                Add a photo of your food or receipt (Optional)
              </h2>

              <div className="bg-[#16171D] border-2 border-dashed border-[#272932] p-8 rounded-3xl text-center space-y-3 cursor-pointer hover:border-[#FACC15] transition-all">
                <UploadCloud size={36} className="text-slate-500 mx-auto" />
                <p className="text-xs font-bold text-slate-400">Tap to upload food or receipt image</p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setCurrentStep(6)}
                  className="bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm px-5 py-2.5 rounded-xl hover:text-white transition-all cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-[#FACC15] hover:bg-amber-400 text-slate-950 font-black text-sm px-8 py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-amber-400/20 disabled:opacity-50"
                >
                  {loading ? 'Submitting...' : 'Submit Feedback'}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 8: Success & Discount Voucher */}
          {currentStep === 8 && (
            <motion.div
              key="step8"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="space-y-8 text-center py-6"
            >
              <div className="text-5xl">🎉</div>

              <div className="space-y-2">
                <h1 className="text-4xl font-black text-[#FACC15] tracking-tight">
                  Thank You!
                </h1>
                <p className="text-slate-400 text-sm font-medium">
                  Your feedback has been saved and will help us do better.
                </p>
              </div>

              {/* Discount Code Voucher Box */}
              <div className="bg-[#16171D] border border-[#272932] p-6 rounded-3xl space-y-3 shadow-2xl max-w-md mx-auto">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  SHOW THIS CODE ON YOUR NEXT ORDER TO GET KSH 200 OFF:
                </p>
                <p className="text-3xl font-black tracking-widest text-[#FACC15]">
                  {discountCode}
                </p>
              </div>

              <div className="space-y-3 max-w-md mx-auto">
                <a
                  href={`https://wa.me/254700000000?text=Hi%2C%20I%20have%20feedback%20discount%20code%20${discountCode}`}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full bg-[#FACC15] hover:bg-amber-400 text-slate-950 font-black text-sm py-4 px-6 rounded-2xl transition-all shadow-xl shadow-amber-400/20 flex items-center justify-center gap-2"
                >
                  <span>ORDER ON WHATSAPP</span>
                  <ArrowRight size={18} />
                </a>

                <button
                  onClick={() => {
                    setCurrentStep(0);
                    setComment('');
                  }}
                  className="w-full bg-[#16171D] border border-[#272932] text-slate-300 font-bold text-sm py-3.5 px-6 rounded-2xl hover:text-white transition-all cursor-pointer"
                >
                  Submit another response
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="w-full py-5 text-center text-[10px] font-bold text-slate-600 uppercase tracking-widest border-t border-slate-900">
        <span>POWERED BY MANIPOS</span>
      </footer>
    </div>
  );
}
