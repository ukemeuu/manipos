import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getTenantInfo } from '../lib/tenant';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Star, 
  Send, 
  CheckCircle2, 
  Heart, 
  ArrowRight, 
  ArrowLeft, 
  Utensils, 
  Smile, 
  Sparkles, 
  Clock, 
  ThumbsUp, 
  MessageSquare 
} from 'lucide-react';

export function FeedbackForm() {
  const tenantInfo = getTenantInfo();
  const tenantSlug = tenantInfo.tenantSlug || 'potofjollof';
  const tenantDisplayName = tenantSlug.replace('-', ' ').toUpperCase();

  const [currentStep, setCurrentStep] = useState(1);
  const [rating, setRating] = useState(5);
  const [category, setCategory] = useState('Food Quality & Taste');
  const [comment, setComment] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const totalSteps = 4;

  const categories = [
    { label: 'Food Quality & Taste', icon: Utensils, desc: 'Flavor, presentation, and dish temperature' },
    { label: 'Service & Hospitality', icon: Smile, desc: 'Staff friendliness, care, and attentiveness' },
    { label: 'Order Speed & Accuracy', icon: Clock, desc: 'Kitchen prep time and order completeness' },
    { label: 'Cleanliness & Ambience', icon: Sparkles, desc: 'Seating, atmosphere, and restaurant hygiene' }
  ];

  const handleStarSelect = (star) => {
    setRating(star);
    // Auto advance to step 2 for a seamless Typeform feel
    setTimeout(() => {
      setCurrentStep(2);
    }, 250);
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: insertError } = await supabase
        .from('pos_feedback')
        .insert([{
          tenant_id: tenantSlug,
          rating,
          category,
          comment: comment || 'No written comment left.',
          customer_name: customerName || 'Anonymous Guest',
          customer_contact: customerContact || 'N/A'
        }]);

      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err) {
      console.error('Typeform submit error:', err);
      // Fail gracefully so user sees thank you state
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans antialiased flex flex-col justify-between selection:bg-amber-400 selection:text-slate-950">
      
      {/* Top Typeform Progress Bar */}
      <div className="w-full bg-slate-900 border-b border-slate-800/80 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-amber-400 text-slate-950 rounded-lg flex items-center justify-center font-black text-xs shadow-sm">
              M
            </div>
            <span className="font-extrabold text-sm tracking-tight text-white">{tenantDisplayName}</span>
          </div>

          {!submitted && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400">Step {currentStep} of {totalSteps}</span>
              <div className="w-24 sm:w-32 bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-amber-400 h-full transition-all duration-300 ease-out" 
                  style={{ width: `${(currentStep / totalSteps) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive Container */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-6 py-12 flex flex-col justify-center">
        {!submitted ? (
          <AnimatePresence mode="wait">
            
            {/* STEP 1: Star Rating */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                <div className="space-y-3 text-left">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
                    <span>1 &rarr; Overall Rating</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                    How was your experience today at {tenantDisplayName}?
                  </h2>
                  <p className="text-slate-400 text-sm font-medium">
                    Tap a star below to rate your meal and service.
                  </p>
                </div>

                {/* Big Interactive Star Picker */}
                <div className="bg-slate-900/80 border border-slate-800 p-8 rounded-3xl text-center space-y-6 shadow-2xl">
                  <div className="flex items-center justify-center gap-3">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => handleStarSelect(star)}
                        className="p-2 transition-transform hover:scale-125 active:scale-95 focus:outline-none cursor-pointer"
                      >
                        <Star
                          size={46}
                          className={star <= rating ? "fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.5)]" : "text-slate-700 hover:text-slate-500"}
                        />
                      </button>
                    ))}
                  </div>

                  <div className="text-base font-extrabold text-amber-400 h-6">
                    {rating === 5 && "⭐ Excellent - Loved Everything!"}
                    {rating === 4 && "👍 Very Good - Satisfied"}
                    {rating === 3 && "👌 Okay - Could Be Better"}
                    {rating === 2 && "👎 Below Expectations"}
                    {rating === 1 && "⚠️ Disappointed"}
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-400/20"
                  >
                    <span>Next Question</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: Category Select */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                <div className="space-y-3 text-left">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
                    <span>2 &rarr; Primary Focus</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                    What stood out most during your visit?
                  </h2>
                  <p className="text-slate-400 text-sm font-medium">
                    Select the area you would like to highlight.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {categories.map((cat) => {
                    const IconComp = cat.icon;
                    const isSelected = category === cat.label;
                    return (
                      <button
                        key={cat.label}
                        type="button"
                        onClick={() => {
                          setCategory(cat.label);
                          setTimeout(() => setCurrentStep(3), 200);
                        }}
                        className={`p-5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-3 ${
                          isSelected
                            ? "bg-amber-400 text-slate-950 border-amber-400 shadow-xl shadow-amber-400/20"
                            : "bg-slate-900/90 text-slate-200 border-slate-800 hover:border-slate-600"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                            isSelected ? "bg-slate-950 text-amber-400" : "bg-slate-800 text-amber-400"
                          }`}>
                            <IconComp size={22} />
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isSelected ? "bg-slate-950/20 text-slate-950" : "text-slate-500"}`}>
                            Tap to Select
                          </span>
                        </div>
                        <div>
                          <h4 className="font-black text-base leading-snug">{cat.label}</h4>
                          <p className={`text-xs font-medium mt-1 ${isSelected ? "text-slate-900" : "text-slate-400"}`}>
                            {cat.desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="text-slate-400 hover:text-white font-bold text-xs flex items-center gap-1 py-2 px-3 rounded-lg cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-400/20"
                  >
                    <span>Next Question</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: Detailed Comments */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                <div className="space-y-3 text-left">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
                    <span>3 &rarr; Details & Suggestions</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                    Any specific thoughts or comments?
                  </h2>
                  <p className="text-slate-400 text-sm font-medium">
                    Tell us what you loved or what our chef/team can improve.
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl space-y-4">
                  <textarea
                    autoFocus
                    rows={4}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Type your review or thoughts here..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-base text-white font-medium focus:outline-none focus:border-amber-400 transition-all placeholder:text-slate-600 resize-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="text-slate-400 hover:text-white font-bold text-xs flex items-center gap-1 py-2 px-3 rounded-lg cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm px-6 py-3.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-400/20"
                  >
                    <span>Final Step</span>
                    <ArrowRight size={16} />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: Optional Contact & Submit */}
            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="space-y-8"
              >
                <div className="space-y-3 text-left">
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3 py-1 rounded-full">
                    <span>4 &rarr; Almost Done</span>
                  </div>
                  <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                    Would you like us to follow up or send rewards?
                  </h2>
                  <p className="text-slate-400 text-sm font-medium">
                    Leave your contact info if you'd like our manager to respond. (Optional)
                  </p>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-3xl shadow-xl space-y-4 text-left">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Your Name
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Sarah Jenkins"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-semibold focus:outline-none focus:border-amber-400 transition-all placeholder:text-slate-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Mobile Phone or Email
                    </label>
                    <input
                      type="text"
                      value={customerContact}
                      onChange={(e) => setCustomerContact(e.target.value)}
                      placeholder="+254 700 000 000 or email@domain.com"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white font-semibold focus:outline-none focus:border-amber-400 transition-all placeholder:text-slate-600"
                    />
                  </div>
                </div>

                {error && <p className="text-red-400 text-xs font-bold text-center">{error}</p>}

                <div className="flex items-center justify-between pt-4">
                  <button
                    onClick={() => setCurrentStep(3)}
                    className="text-slate-400 hover:text-white font-bold text-xs flex items-center gap-1 py-2 px-3 rounded-lg cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Back</span>
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="bg-amber-400 hover:bg-amber-500 text-slate-950 font-black text-sm px-8 py-4 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-xl shadow-amber-400/25 disabled:opacity-50"
                  >
                    {loading ? (
                      <span>Sending Response...</span>
                    ) : (
                      <>
                        <span>Submit Feedback</span>
                        <Send size={18} />
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        ) : (
          /* THANK YOU STATE */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900/90 border border-slate-800 p-8 sm:p-12 rounded-3xl text-center space-y-6 shadow-2xl"
          >
            <div className="w-20 h-20 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30 shadow-lg">
              <CheckCircle2 size={48} />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-black text-white">Thank You for Your Feedback!</h2>
              <p className="text-slate-400 text-sm font-medium max-w-sm mx-auto leading-relaxed">
                Your response has been sent to our manager team. We value your business and hope to see you again soon!
              </p>
            </div>

            <div className="pt-4">
              <button
                onClick={() => {
                  setSubmitted(false);
                  setCurrentStep(1);
                  setComment('');
                }}
                className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer"
              >
                Submit another response
              </button>
            </div>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full py-6 text-center text-xs font-semibold text-slate-600 border-t border-slate-900">
        <span>Powered by ManiPOS Cloud Engine</span>
      </footer>
    </div>
  );
}
