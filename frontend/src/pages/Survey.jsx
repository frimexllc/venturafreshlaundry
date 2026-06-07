import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import PublicNav from "../components/PublicNav";
import PublicFooter from "../components/PublicFooter";
import { useLocale } from "../context/LocaleContext";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Survey() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLocale();

  const customerId = searchParams.get("cid");
  const ordersCount = searchParams.get("ordercount");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentSection, setCurrentSection] = useState(1);
  const [progress, setProgress] = useState(0);

  // Form state
  const [satisfaction, setSatisfaction] = useState(null);
  const [valuedAspects, setValuedAspects] = useState([]);
  const [qualityRating, setQualityRating] = useState("");
  const [issues, setIssues] = useState([]);
  const [usedOther, setUsedOther] = useState(null);
  const [reasonToTry, setReasonToTry] = useState("");
  const [improvement, setImprovement] = useState("");
  const [recommendation, setRecommendation] = useState(null);
  const [interestedIn, setInterestedIn] = useState([]);

  const valuedOptions = [
    "Convenience", "Pickup & Delivery", "Faster turnaround",
    "Better folding quality", "Cleaner smell", "Customer service",
    "Easier communication", "Pricing", "Reliability",
    "Professionalism", "Membership benefits"
  ];

  const issuesOptions = [
    "Delayed order", "Missing item", "Folding issue",
    "Communication issue", "Payment issue", "Delivery timing issue",
    "Strong/weak detergent scent", "Special instructions not followed",
    "No issues at all"
  ];

  const reasonOptions = [
    "Better pricing", "Faster service", "Better communication",
    "More professional", "Pickup & Delivery", "Membership options",
    "Cleaner facility", "Recommended by someone", "Social media",
    "Previous provider disappointed me", "Looking for something more reliable",
    "Wanted better quality", "Other"
  ];

  const interestOptions = [
    "Monthly memberships", "Priority / express service", "Commercial laundry",
    "Airbnb laundry service", "Recurring scheduled pickups",
    "Family plans", "Special promotions", "Text notifications",
    "App / customer portal improvements"
  ];

  useEffect(() => {
    if (!customerId || !ordersCount) {
      toast.error(t("Invalid survey link", "Enlace de encuesta inválido"));
      navigate("/");
    }
  }, [customerId, ordersCount, navigate, t]);

  useEffect(() => {
    setProgress((currentSection - 1) * 25);
  }, [currentSection]);

  const nextSection = () => {
    if (currentSection === 1 && satisfaction === null) {
      toast.error(t("Please rate your satisfaction", "Por favor califica tu satisfacción"));
      return;
    }
    if (currentSection === 2 && !qualityRating) {
      toast.error(t("Please rate the quality", "Por favor califica la calidad"));
      return;
    }
    if (currentSection === 4 && recommendation === null) {
      toast.error(t("Please provide a recommendation score", "Por favor da una puntuación de recomendación"));
      return;
    }
    if (currentSection < 4) setCurrentSection(prev => prev + 1);
  };

  const prevSection = () => {
    if (currentSection > 1) setCurrentSection(prev => prev - 1);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (recommendation === null) {
      toast.error(t("Please provide a recommendation score", "Por favor da una puntuación de recomendación"));
      return;
    }
    setLoading(true);
    try {
      await axios.post(`${API}/public/survey-response`, {
        customer_id: customerId,
        orders_count_at_send: parseInt(ordersCount),
        satisfaction_score: satisfaction,
        valued_aspects: valuedAspects.slice(0, 2),
        quality_rating: qualityRating,
        issues_experienced: issues,
        used_other_service_before: usedOther === "yes",
        reason_to_try_us: reasonToTry,
        improvement_suggestion: improvement || null,
        recommendation_score: recommendation,
        interested_in: interestedIn,
        submitted_at: new Date().toISOString()
      });
      setSubmitted(true);
      toast.success(t("Thank you for your feedback!", "¡Gracias por tu feedback!"));
    } catch (err) {
      toast.error(err.response?.data?.detail || "Error submitting survey");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <>
        <PublicNav />
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pt-24">
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-3">
                {t("Thank you!", "¡Gracias!")}
              </h2>
              <p className="text-slate-600 text-lg">
                {t("Your feedback helps us serve you better.", "Tu opinión nos ayuda a servirte mejor.")}
              </p>
            </div>
          </div>
        </div>
        <PublicFooter />
      </>
    );
  }

  return (
    <>
      <PublicNav />
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pt-24 pb-16">
        <div className="max-w-3xl mx-auto px-4">
          {/* Progress bar */}
          <div className="mb-8">
            <div className="flex justify-between text-xs text-slate-500 mb-2">
              <span className={currentSection >= 1 ? "text-sky-600 font-semibold" : ""}>1. Satisfacción</span>
              <span className={currentSection >= 2 ? "text-sky-600 font-semibold" : ""}>2. Calidad</span>
              <span className={currentSection >= 3 ? "text-sky-600 font-semibold" : ""}>3. Antes de nosotros</span>
              <span className={currentSection >= 4 ? "text-sky-600 font-semibold" : ""}>4. Mejora</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-sky-500 to-blue-600 transition-all duration-300 rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
            <div className="bg-gradient-to-r from-sky-600 to-blue-600 px-6 py-8 text-white">
              <h1 className="text-2xl font-bold">Ventura Fresh Laundry</h1>
              <p className="text-white/80 mt-1 text-sm">
                {t("Customer Experience Survey", "Encuesta de Experiencia del Cliente")}
              </p>
              <p className="text-white/60 text-xs mt-2">
                {t("We value your opinion. This survey takes about 2 minutes.", "Valoramos tu opinión. Esta encuesta toma unos 2 minutos.")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 md:p-8">
              {/* Section 1 */}
              {currentSection === 1 && (
                <div className="space-y-6 animate-fadeIn">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      1. {t("Overall, how satisfied are you with our service?", "En general, ¿qué tan satisfecho estás con nuestro servicio?")}
                    </label>
                    <div className="flex gap-2 justify-center py-4">
                      {[1,2,3,4,5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setSatisfaction(star)}
                          className={`text-4xl transition-all transform hover:scale-110 ${satisfaction >= star ? "text-yellow-400" : "text-gray-300"}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 px-2">
                      <span>{t("Very dissatisfied", "Muy insatisfecho")}</span>
                      <span>{t("Very satisfied", "Muy satisfecho")}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      {t("What do you value MOST about Ventura Fresh Laundry? (max 2)", "¿Qué valoras MÁS de Ventura Fresh Laundry? (máx 2)")}
                    </label>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {valuedOptions.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            value={opt}
                            checked={valuedAspects.includes(opt)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (valuedAspects.length < 2) {
                                  setValuedAspects([...valuedAspects, opt]);
                                } else {
                                  toast.warning(t("Select up to 2", "Selecciona máximo 2"));
                                }
                              } else {
                                setValuedAspects(valuedAspects.filter(v => v !== opt));
                              }
                            }}
                            className="rounded border-gray-300 text-sky-500 focus:ring-sky-500"
                          />
                          <span className="text-slate-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 2 */}
              {currentSection === 2 && (
                <div className="space-y-6 animate-fadeIn">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      2. {t("How would you rate the quality of your laundry care?", "¿Cómo calificarías la calidad del cuidado de tu ropa?")}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: "excellent", label: t("Excellent", "Excelente"), color: "text-green-600", bg: "bg-green-50" },
                        { value: "good", label: t("Good", "Bueno"), color: "text-blue-600", bg: "bg-blue-50" },
                        { value: "average", label: t("Average", "Regular"), color: "text-amber-600", bg: "bg-amber-50" },
                        { value: "needs_improvement", label: t("Needs Improvement", "Necesita mejorar"), color: "text-red-600", bg: "bg-red-50" }
                      ].map(rating => (
                        <button
                          key={rating.value}
                          type="button"
                          onClick={() => setQualityRating(rating.value)}
                          className={`p-3 rounded-xl border-2 transition-all ${qualityRating === rating.value ? `${rating.bg} border-sky-400 shadow-sm` : "border-slate-200 hover:border-slate-300"}`}
                        >
                          <span className={`font-semibold ${rating.color}`}>{rating.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      {t("Did you experience any of the following?", "¿Experimentaste alguno de los siguientes?")}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {issuesOptions.map(issue => (
                        <label key={issue} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            value={issue}
                            checked={issues.includes(issue)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setIssues([...issues, issue]);
                              } else {
                                setIssues(issues.filter(i => i !== issue));
                              }
                            }}
                            className="rounded border-gray-300 text-sky-500"
                          />
                          <span className="text-slate-700">{issue}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Section 3 */}
              {currentSection === 3 && (
                <div className="space-y-6 animate-fadeIn">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      3. {t("Before using Ventura Fresh Laundry, had you used another laundry service before?", "Antes de usar Ventura Fresh Laundry, ¿habías usado otro servicio de lavandería?")}
                    </label>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setUsedOther("yes")}
                        className={`px-6 py-2 rounded-full border-2 transition-all ${usedOther === "yes" ? "bg-sky-50 border-sky-400 text-sky-700" : "border-slate-200 hover:border-slate-300"}`}
                      >
                        {t("Yes", "Sí")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setUsedOther("no")}
                        className={`px-6 py-2 rounded-full border-2 transition-all ${usedOther === "no" ? "bg-sky-50 border-sky-400 text-sky-700" : "border-slate-200 hover:border-slate-300"}`}
                      >
                        {t("No", "No")}
                      </button>
                    </div>
                  </div>

                  {usedOther === "yes" && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-3">
                        {t("What made you decide to try Ventura Fresh Laundry?", "¿Qué te hizo decidir probar Ventura Fresh Laundry?")}
                      </label>
                      <select
                        value={reasonToTry}
                        onChange={(e) => setReasonToTry(e.target.value)}
                        className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-sky-200 focus:border-sky-400 outline-none transition"
                      >
                        <option value="">{t("Select an option...", "Selecciona una opción...")}</option>
                        {reasonOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Section 4 */}
              {currentSection === 4 && (
                <div className="space-y-6 animate-fadeIn">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      4. {t("What is ONE thing we could improve to make your experience even better?", "¿Qué es UNA cosa que podríamos mejorar para hacer tu experiencia aún mejor?")}
                    </label>
                    <textarea
                      value={improvement}
                      onChange={(e) => setImprovement(e.target.value)}
                      rows="3"
                      className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-sky-200 focus:border-sky-400 outline-none transition"
                      placeholder={t("Your suggestion...", "Tu sugerencia...")}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      {t("How likely are you to recommend Ventura Fresh Laundry to friends or family?", "¿Qué tan probable es que recomiendes Ventura Fresh Laundry a amigos o familiares?")}
                    </label>
                    <div className="flex flex-wrap gap-2 justify-center py-2">
                      {[...Array(11).keys()].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setRecommendation(n)}
                          className={`w-10 h-10 rounded-full border-2 transition-all font-semibold ${recommendation === n ? "bg-sky-500 text-white border-sky-500 shadow-md" : "border-gray-300 hover:border-sky-300"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 px-2 mt-2">
                      <span>{t("Not likely", "Poco probable")}</span>
                      <span>{t("Very likely", "Muy probable")}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">
                      {t("Would you be interested in:", "¿Te interesaría:")}
                    </label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {interestOptions.map(opt => (
                        <label key={opt} className="flex items-center gap-2 text-sm p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            value={opt}
                            checked={interestedIn.includes(opt)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setInterestedIn([...interestedIn, opt]);
                              } else {
                                setInterestedIn(interestedIn.filter(i => i !== opt));
                              }
                            }}
                            className="rounded border-gray-300 text-sky-500"
                          />
                          <span className="text-slate-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between gap-4 mt-8 pt-6 border-t border-slate-100">
                {currentSection > 1 && (
                  <button
                    type="button"
                    onClick={prevSection}
                    className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 transition"
                  >
                    ← {t("Back", "Atrás")}
                  </button>
                )}
                {currentSection < 4 && (
                  <button
                    type="button"
                    onClick={nextSection}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold hover:shadow-md transition ml-auto"
                  >
                    {t("Next", "Siguiente")} →
                  </button>
                )}
                {currentSection === 4 && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold hover:shadow-md transition disabled:opacity-50 ml-auto"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        {t("Sending...", "Enviando...")}
                      </div>
                    ) : (
                      t("Submit survey", "Enviar encuesta")
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
      <PublicFooter />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </>
  );
}