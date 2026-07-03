import React, { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import emailjs from 'emailjs-com';
import { 
  FileText, 
  User, 
  Mail, 
  Calendar, 
  MapPin, 
  Phone, 
  AlertCircle, 
  CheckCircle2, 
  PenTool, 
  Upload, 
  Activity, 
  ShieldAlert, 
  Loader2, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  Building,
  HeartHandshake
} from 'lucide-react';

// EmailJS placeholders. Users can modify these to connect their account.
const EMAILJS_SERVICE_ID = "service_lc2lc5k"; // Hardcoded Service ID
const EMAILJS_TEMPLATE_ID = "template_tcski2k"; // Hardcoded Template ID
const EMAILJS_PUBLIC_KEY = "UAbxHvr8CObbDeOgD"; // Hardcoded Public Key

const TRIP_TYPES = [
  "Standard Sightseeing",
  "Wildlife Safari",
  "Corporate Offsite"
];

function App() {
  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    age: '',
    tripType: 'Standard Sightseeing',
    occupation: '', // Inclusive: replaced college
    mobile: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    parentName: '' // Dynamic: guardian name for minors
  });

  // UI & Processing States
  const [signatureMethod, setSignatureMethod] = useState('draw'); // 'draw' | 'upload'
  const [signatureImage, setSignatureImage] = useState(null); // transparent base64 PNG
  const [isWaiverRead, setIsWaiverRead] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [signatureWarning, setSignatureWarning] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [ipAddress, setIpAddress] = useState('Fetching...');
  const [scrolledToBottom, setScrolledToBottom] = useState(false);

  // EmailJS keys override (for testing purposes)
  const [serviceId, setServiceId] = useState(EMAILJS_SERVICE_ID);
  const [templateId, setTemplateId] = useState(EMAILJS_TEMPLATE_ID);
  const [publicKey, setPublicKey] = useState(EMAILJS_PUBLIC_KEY);

  // Refs
  const waiverRef = useRef(null);
  const fileInputRef = useRef(null);
  const canvasRef = useRef(null);
  const sigPadRef = useRef(null);

  const isMinor = formData.age && parseInt(formData.age) < 18;

  // Fetch client IP address on mount
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setIpAddress(data.ip))
      .catch(err => {
        console.error('IP fetch error:', err);
        setIpAddress('Could not determine');
      });
  }, []);

  // Monitor waiver scrolling
  const handleWaiverScroll = () => {
    if (waiverRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = waiverRef.current;
      // If user scrolled within 10px of bottom, unlock agreement checkbox
      if (scrollHeight - scrollTop - clientHeight < 10) {
        setScrolledToBottom(true);
      }
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 1. Drawing Pad Actions
  const handleDrawEnd = () => {
    if (sigPadRef.current) {
      if (!sigPadRef.current.isEmpty()) {
        const base64 = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
        setSignatureImage(base64);
        setSignatureWarning('');
      }
    }
  };

  const handleClearDraw = () => {
    if (sigPadRef.current) {
      sigPadRef.current.clear();
      setSignatureImage(null);
      setSignatureWarning('');
    }
  };

  // 2. Image Processing & Brightness Validation for Upload
  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingUpload(true);
    setSignatureWarning('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const maxDim = 400;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Analyze brightness & process background removal
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        let totalBrightness = 0;
        const totalPixels = data.length / 4;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          totalBrightness += luma;
        }

        const avgBrightness = totalBrightness / totalPixels;

        // Validation: If overall image is too dark (average brightness below 120),
        // warning is triggered and submission disabled
        if (avgBrightness < 120) {
          setSignatureWarning('Please ensure your signature is clear and in dark ink on white paper.');
          setSignatureImage(null);
          setIsProcessingUpload(false);
          return;
        }

        // Processing: Light pixels (brightness > 180) become transparent.
        // Dark pixels (ink) are forced to crisp black.
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;

          if (luma > 180) {
            data[i + 3] = 0; // Transparent
          } else {
            data[i] = 10;     // R
            data[i + 1] = 10; // G
            data[i + 2] = 10; // B
            data[i + 3] = 255;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const processedBase64 = canvas.toDataURL('image/png');
        setSignatureImage(processedBase64);
        setIsProcessingUpload(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleClearUpload = () => {
    setSignatureImage(null);
    setSignatureWarning('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTabChange = (tab) => {
    setSignatureMethod(tab);
    setSignatureImage(null);
    setSignatureWarning('');
    if (tab === 'draw' && sigPadRef.current) {
      sigPadRef.current.clear();
    }
    if (tab === 'upload' && fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Submit Waiver Flow
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isWaiverRead) {
      setSubmitError('Please read the liability waiver and tick the agreement checkbox.');
      return;
    }

    if (!signatureImage) {
      setSubmitError('Please sign on the signature pad or upload a valid signature image.');
      return;
    }

    if (signatureWarning) {
      setSubmitError('Cannot submit. Please resolve the signature contrast warning first.');
      return;
    }

    if (isMinor && !formData.parentName) {
      setSubmitError('Parent or guardian name is required for participants under 18 years of age.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    // Generate dates
    const today = new Date();
    const tripDateString = today.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const fullTimestampString = today.toLocaleString('en-US');

    // Displayed name combines minor name and guardian name for template readability
    const customerDisplayName = isMinor 
      ? `${formData.fullName} (Minor - Parent/Guardian: ${formData.parentName})` 
      : formData.fullName;

    try {
      // Prepare inline HTML EmailJS payload
      const templateParams = {
        subject: `${tripDateString} - Waiver - ${formData.fullName} - ${formData.tripType}`,
        customer_name: customerDisplayName,
        customer_email: formData.email,
        trip_type: formData.tripType,
        trip_date: tripDateString, // generated date
        signature_image: signatureImage, // base64 transparent signature
        timestamp: fullTimestampString,
        ip_address: ipAddress,
        user_agent: navigator.userAgent
      };

      if (serviceId === "YOUR_SERVICE_ID" || templateId === "YOUR_TEMPLATE_ID" || publicKey === "YOUR_PUBLIC_KEY") {
        console.log("EmailJS keys are placeholder strings. Simulating submission in development...");
        console.log("Subject:", templateParams.subject);
        console.log("Payload:", templateParams);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        await emailjs.send(serviceId, templateId, templateParams, publicKey);
      }

      setIsSubmitted(true);
    } catch (err) {
      console.error('EmailJS error:', err);
      setSubmitError(err.text || err.message || 'An error occurred while sending your waiver. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render Success Component
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 antialiased">
        <div className="w-full max-w-lg bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-lime-500/10 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl"></div>

          <div className="inline-flex items-center justify-center w-20 h-20 bg-lime-500/10 rounded-full mb-6 border border-lime-500/30 text-lime-400 relative">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
            <div className="absolute inset-0 rounded-full border-2 border-lime-400/20 animate-ping"></div>
          </div>

          <h2 className="text-3xl font-extrabold text-white mb-3">Waiver Submitted!</h2>
          <p className="text-slate-300 mb-6 text-sm md:text-base leading-relaxed">
            Thank you, <span className="font-semibold text-lime-400">{formData.fullName}</span>! Your waiver has been securely signed and submitted.
          </p>

          <div className="bg-slate-900/60 rounded-2xl p-5 mb-8 text-left border border-slate-700/30 space-y-3.5 text-xs text-slate-400">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>Trip Category:</span>
              <span className="font-semibold text-white">{formData.tripType}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>Submission Date:</span>
              <span className="font-semibold text-white">{new Date().toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>Registered Email:</span>
              <span className="font-semibold text-white">{formData.email}</span>
            </div>
            {isMinor && (
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <span>Parent/Guardian:</span>
                <span className="font-semibold text-white">{formData.parentName}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>System IP:</span>
              <span className="font-semibold text-white">{ipAddress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Delivery Status:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-lime-500/10 text-lime-400 border border-lime-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-400 animate-pulse"></span>
                Securely Dispatched
              </span>
            </div>
          </div>

          <p className="text-slate-400 text-xs mb-6">
            A confirmation receipt copy with your inline details and signature has been sent to your email address.
          </p>

          <button
            onClick={() => {
              setIsSubmitted(false);
              setFormData({
                fullName: '',
                email: '',
                age: '',
                tripType: 'Standard Sightseeing',
                occupation: '',
                mobile: '',
                emergencyContactName: '',
                emergencyContactPhone: '',
                parentName: ''
              });
              setSignatureImage(null);
              setIsWaiverRead(false);
              setScrolledToBottom(false);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-lime-500 hover:bg-lime-400 text-slate-950 font-bold transition-all duration-200 shadow-lg shadow-lime-500/20 hover:shadow-lime-500/35 focus:ring-2 focus:ring-lime-500/50"
          >
            Sign Another Consent Form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 px-4 sm:px-6 lg:px-8 text-slate-100 flex flex-col items-center antialiased">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Container: Landscape Layout on Desktop / Portrait on Mobile */}
      <div className="w-full max-w-7xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 shadow-2xl rounded-3xl overflow-hidden relative">
        
        {/* Glow gradients */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-lime-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

        {/* Company Header */}
        <div className="pt-8 pb-6 text-center border-b border-slate-800 bg-slate-900/40 px-4">
          <img 
            src="/logo.png" 
            alt="Ghumoo With Us" 
            className="mx-auto w-32 md:w-36 h-auto object-contain rounded-full shadow-lg border border-slate-800 p-1 mb-4 hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
            GHUMOO WITH US
          </h1>
          <p className="mt-2 text-slate-400 text-sm md:text-base font-semibold max-w-md mx-auto">
            Digital Waiver & Tour Consent Form
          </p>
        </div>

        {/* Developer Sandbox Panel */}
        <div className="bg-slate-950/60 border-b border-slate-800/80 p-4 text-xs">
          <details className="cursor-pointer group">
            <summary className="font-semibold text-lime-400 hover:text-lime-300 flex items-center gap-2 list-none select-none">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Developer Panel: Configure EmailJS Keys (Click to expand)</span>
            </summary>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Service ID</label>
                <input 
                  type="text" 
                  value={serviceId} 
                  onChange={(e) => setServiceId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Template ID</label>
                <input 
                  type="text" 
                  value={templateId} 
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Public Key</label>
                <input 
                  type="text" 
                  value={publicKey} 
                  onChange={(e) => setPublicKey(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-lime-500"
                />
              </div>
            </div>
          </details>
        </div>

        {/* Main Grid: Responsive split column layout */}
        <form onSubmit={handleSubmit} className="p-6 md:p-8 lg:grid lg:grid-cols-12 lg:gap-8 space-y-8 lg:space-y-0">
          
          {/* LEFT COLUMN: Registrant & Trip Inputs (col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Section 1: Trip Details */}
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-4">
                <MapPin className="w-5 h-5 text-lime-400" />
                <h2 className="text-base md:text-lg font-bold text-white">1. Select Trip Details</h2>
              </div>
              
              <div>
                <label htmlFor="tripType" className="block text-xs font-semibold text-slate-300 mb-2">
                  Trip Type *
                </label>
                <div className="relative">
                  <select
                    id="tripType"
                    name="tripType"
                    value={formData.tripType}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 font-medium focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all duration-200 appearance-none text-sm"
                    required
                  >
                    {TRIP_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-slate-400">
                    ▼
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Registrant Details */}
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80 space-y-5">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-1">
                <User className="w-5 h-5 text-lime-400" />
                <h2 className="text-base md:text-lg font-bold text-white">2. Personal Information</h2>
              </div>

              <div>
                <label htmlFor="fullName" className="block text-xs font-semibold text-slate-300 mb-2">
                  Full Legal Name *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all duration-200 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-slate-300 mb-2">
                    Email Address *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="john@email.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all duration-200 text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="age" className="block text-xs font-semibold text-slate-300 mb-2">
                    Age *
                  </label>
                  <input
                    type="number"
                    id="age"
                    name="age"
                    min="1"
                    max="120"
                    placeholder="e.g., 25"
                    value={formData.age}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all duration-200 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Minor Parent/Guardian Field */}
              {isMinor && (
                <div className="animate-fade-in bg-amber-500/5 border border-amber-500/20 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs">
                    <HeartHandshake className="w-4 h-4 shrink-0" />
                    <span>Minor Consent Required (Age under 18)</span>
                  </div>
                  <div>
                    <label htmlFor="parentName" className="block text-xs font-semibold text-slate-300 mb-2">
                      Parent / Guardian Full Name *
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        id="parentName"
                        name="parentName"
                        placeholder="Guardian's Legal Name"
                        value={formData.parentName}
                        onChange={handleInputChange}
                        className="w-full bg-slate-950/80 border border-amber-500/30 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all duration-200 text-sm"
                        required={isMinor}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="occupation" className="block text-xs font-semibold text-slate-300 mb-2">
                  Occupation / Organization (Optional)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                    <Building className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    id="occupation"
                    name="occupation"
                    placeholder="e.g., Professional, Self-employed, Student"
                    value={formData.occupation}
                    onChange={handleInputChange}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all duration-200 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="mobile" className="block text-xs font-semibold text-slate-300 mb-2">
                    Mobile Number *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="tel"
                      id="mobile"
                      name="mobile"
                      placeholder="e.g., +91 98765 43210"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-lime-500 focus:border-transparent transition-all duration-200 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="bg-slate-950/40 p-4 rounded-xl border border-slate-800/80 grid grid-cols-2 gap-3">
                  <div className="col-span-2 text-xs font-bold text-slate-300 mb-0.5">Emergency Contact Details</div>
                  <div>
                    <label htmlFor="emergencyContactName" className="block text-[10px] font-bold text-slate-400 mb-1">
                      Emergency Name *
                    </label>
                    <input
                      type="text"
                      id="emergencyContactName"
                      name="emergencyContactName"
                      placeholder="Relation / Name"
                      value={formData.emergencyContactName}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 focus:ring-1 focus:ring-lime-500 focus:border-transparent transition-all text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="emergencyContactPhone" className="block text-[10px] font-bold text-slate-400 mb-1">
                      Emergency Phone *
                    </label>
                    <input
                      type="tel"
                      id="emergencyContactPhone"
                      name="emergencyContactPhone"
                      placeholder="Contact No."
                      value={formData.emergencyContactPhone}
                      onChange={handleInputChange}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 placeholder-slate-600 focus:ring-1 focus:ring-lime-500 focus:border-transparent transition-all text-xs"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Waiver, Signature & Submit (col-span-7) */}
          <div className="lg:col-span-7 space-y-6 flex flex-col justify-between">
            
            {/* Section 3: Waiver Agreement (Expanded for less scrolling) */}
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
                <FileText className="w-5 h-5 text-lime-400" />
                <h2 className="text-base md:text-lg font-bold text-white">3. Review Consent Waiver</h2>
              </div>
              
              <div 
                ref={waiverRef}
                onScroll={handleWaiverScroll}
                className="h-[360px] overflow-y-auto border border-slate-800 rounded-2xl p-5 bg-slate-950/60 custom-scrollbar space-y-4 text-xs text-slate-300 leading-relaxed"
              >
                <h3 className="text-center font-extrabold text-slate-100 border-b border-slate-800 pb-3 text-[13px] tracking-wide">
                  TOUR TERMS, CONDITIONS, AND LIABILITY WAIVER
                </h3>
                
                <p className="italic text-slate-400 text-center text-[11px]">
                  By proceeding with this submission, I, the participant (or my parent/guardian if I am under 18 years of age) whose details are specified in the accompanying form, hereby voluntarily register for the tour organized by Ghumoo With Us and unconditionally agree to the following legally binding terms:
                </p>
                
                <div className="space-y-3">
                  <p className="font-bold text-slate-200 text-[11px]">1. Participant Code of Conduct & Discipline</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="font-semibold text-slate-200">Zero-Tolerance Policy:</span> The consumption, possession, or distribution of alcohol, cigarettes, e-cigarettes, vapes, drugs, or any illegal intoxicating substances is strictly prohibited throughout the entire duration of the tour (including transit and hotel stays).</li>
                    <li><span className="font-semibold text-slate-200">Compliance:</span> I agree to strictly adhere to the itinerary timings, safety instructions, and decisions made by the assigned Tour Leader and organizers.</li>
                    <li><span className="font-semibold text-slate-200">Expulsion without Refund:</span> Any instance of misbehavior, indiscipline, late reporting, or failure to follow instructions will result in immediate removal from the tour. In such cases, the company is not liable to provide any alternative transport, accommodation, or financial refund.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-slate-200 text-[11px]">2. Financial Liability & Property Damage</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><span className="font-semibold text-slate-200">Property Damage:</span> I accept full financial responsibility for any damage caused by me to hotel rooms, vehicles, public property, or third-party equipment during the tour. All repair or replacement costs must be settled by me immediately on-site.</li>
                    <li><span className="font-semibold text-slate-200">Personal Belongings:</span> Ghumoo With Us acts solely as a facilitator. The company, its employees, and coordinators accept zero liability for the loss, theft, or damage of personal belongings, including mobile phones, wallets, cameras, luggage, or cash.</li>
                  </ul>
                </div>
                
                {/* Bold Risk Clause */}
                <div className="pl-3 border-l-2 border-lime-500 bg-lime-500/5 py-2 px-3 rounded-r-xl">
                  <p className="font-bold text-lime-300 text-[11px] mb-1">3. Absolute Assumption of Risk & Indemnity</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li><span className="font-bold">Inherent Risks:</span> I understand that travel, sightseeing, and adventure/wildlife activities involve inherent risks of delay, illness, personal injury, or unforeseen hazards.</li>
                    <li><span className="font-bold">Release of Liability:</span> I voluntarily assume all risks associated with my participation. I hereby release, acquit, and forever discharge Ghumoo With Us, its directors, partners, and field staff from any and all legal claims, liabilities, demands, or lawsuits arising out of any personal injury, severe bodily harm, illness, medical emergency, or accidental death during the tour.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-slate-200 text-[11px]">4. Medical Fitness & Emergency Authorization</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>I certify that I am mentally and physically fit to undertake this travel itinerary. I have transparently disclosed any pre-existing medical conditions to the organizers prior to departure.</li>
                    <li>In the event of a medical emergency, I authorize the tour coordinators to arrange for local medical treatment, hospitalization, or first-aid at my sole financial expense.</li>
                  </ul>
                </div>
                
                {/* Bold Force Majeure Clause */}
                <div className="pl-3 border-l-2 border-lime-500 bg-lime-500/5 py-2 px-3 rounded-r-xl">
                  <p className="font-bold text-lime-300 text-[11px] mb-1">5. Force Majeure & Third-Party Service Limitations</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-300">
                    <li>Ghumoo With Us relies on third-party vendors (hotels, transport operators, safari vehicles). The company is not liable for deficiencies in service, accidents, or delays caused by these independent vendors.</li>
                    <li><span className="font-bold">Unforeseen Events:</span> The company is not liable for tour cancellations, changes in itinerary, or incomplete sightseeing caused by Force Majeure events—including but not limited to landslides, floods, extreme weather, political strikes (bandhs), riots, road blockades, or sudden government/forest department restrictions. No refunds or compensations will be issued under these circumstances.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-slate-200 text-[11px]">6. Refund and Cancellation Policy</p>
                  <p className="pl-1">
                    Once the tour has commenced, no refunds, partial or full, will be provided for unutilized services, voluntary dropouts, or disciplinary expulsions.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-slate-200 text-[11px]">7. Media Content Release</p>
                  <p className="pl-1">
                    I hereby grant Ghumoo With Us the absolute right and permission to use any photographs, videos, or digital media captured of me during the tour for promotional, social media marketing, and internal record purposes without requiring further compensation or approval.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-slate-200 text-[11px]">8. Governing Law and Legal Jurisdiction</p>
                  <p className="pl-1">
                    This agreement shall be governed by and construed in accordance with the laws of India. Any legal disputes, claims, or proceedings arising out of this contract shall be subject to the exclusive jurisdiction of the competent courts in Kolkata, West Bengal only.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-slate-800">
                  <p className="font-bold text-slate-100 text-center">
                    FINAL DECLARATION
                  </p>
                  <p className="mt-1 font-bold text-slate-300 text-center text-[10px]">
                    By providing my digital/uploaded signature below, I acknowledge that I have read this entire document carefully, understood its legal implications, and agree to be bound by all its terms voluntarily and under my own free will.
                  </p>
                </div>
              </div>

              {/* Checkbox wrapper */}
              <div className="mt-4 flex items-start gap-3">
                <div className="flex items-center h-5">
                  <input
                    id="waiverCheckbox"
                    type="checkbox"
                    disabled={!scrolledToBottom}
                    checked={isWaiverRead}
                    onChange={(e) => setIsWaiverRead(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-700 text-lime-500 focus:ring-lime-500 bg-slate-950 focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>
                <label htmlFor="waiverCheckbox" className="text-xs text-slate-300 select-none">
                  {!scrolledToBottom ? (
                    <span className="text-amber-400 font-medium">
                      ⚠️ Please scroll to the bottom of the waiver to enable and agree to these terms.
                    </span>
                  ) : (
                    <span>I have read, understood, and agree to the <strong>Tour Terms, Conditions, and Liability Waiver</strong> above.</span>
                  )}
                </label>
              </div>
            </div>

            {/* Section 4: Dual Signature Component */}
            <div className="bg-slate-900/40 p-5 rounded-2xl border border-slate-800/80">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-2 mb-3">
                <PenTool className="w-5 h-5 text-lime-400" />
                <h2 className="text-base md:text-lg font-bold text-white">
                  {isMinor ? "4. Parent / Guardian Consent Signature" : "4. Provide Consent Signature"}
                </h2>
              </div>
              
              <p className="text-xs text-slate-400 mb-3">
                {isMinor 
                  ? "As the participant is a minor, the parent/guardian must sign below."
                  : "Please choose your signature format: draw on the pad or upload an image."}
              </p>

              {/* Method Tabs */}
              <div className="flex border-b border-slate-800 mb-4 max-w-xs">
                <button
                  type="button"
                  onClick={() => handleTabChange('draw')}
                  className={`flex-1 pb-2 text-xs font-semibold border-b-2 text-center transition-all duration-200 ${
                    signatureMethod === 'draw' 
                      ? 'border-lime-500 text-lime-400' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ✏️ Draw Pad
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('upload')}
                  className={`flex-1 pb-2 text-xs font-semibold border-b-2 text-center transition-all duration-200 ${
                    signatureMethod === 'upload' 
                      ? 'border-lime-500 text-lime-400' 
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📂 Upload Photo
                </button>
              </div>

              {/* Signature Area Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                
                {/* Tab 1: Draw Signature Pad */}
                {signatureMethod === 'draw' && (
                  <div>
                    <div className="border border-slate-700 rounded-2xl overflow-hidden bg-white p-1">
                      <SignatureCanvas 
                        ref={sigPadRef}
                        penColor="black"
                        onEnd={handleDrawEnd}
                        canvasProps={{
                          className: "w-full h-32 cursor-crosshair rounded-xl"
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleClearDraw}
                      className="mt-2 bg-slate-850 hover:bg-slate-800 text-slate-300 font-semibold px-3 py-1.5 rounded-xl text-[10px] border border-slate-700 flex items-center gap-1 shadow transition-colors"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      Clear Signature Pad
                    </button>
                  </div>
                )}

                {/* Tab 2: Upload File Panel */}
                {signatureMethod === 'upload' && (
                  <div>
                    <input
                      type="file"
                      id="signatureFile"
                      accept="image/*"
                      ref={fileInputRef}
                      onChange={handleSignatureUpload}
                      className="hidden"
                    />
                    
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex flex-col items-center justify-center border border-slate-800 hover:border-lime-500 hover:bg-slate-850/50 rounded-2xl p-4 transition-all duration-200 cursor-pointer text-center group bg-slate-950/20"
                    >
                      <div className="w-10 h-10 bg-slate-950/80 rounded-full flex items-center justify-center text-slate-400 group-hover:text-lime-400 mb-2 border border-slate-800 transition-colors">
                        {isProcessingUpload ? (
                          <Loader2 className="w-5 h-5 animate-spin text-lime-400" />
                        ) : (
                          <Upload className="w-5 h-5" />
                        )}
                      </div>
                      <span className="block text-xs font-semibold text-slate-200">
                        {isProcessingUpload ? 'Processing Signature...' : 'Select Signature Photo'}
                      </span>
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        Dark ink on white paper
                      </span>
                    </button>

                    {signatureWarning && (
                      <div className="mt-3 flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-xl p-2.5 text-red-300 text-[10px]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-400 mt-0.5" />
                        <div>
                          <p className="font-semibold text-red-200">Contrast Warning</p>
                          <p className="mt-0.5">{signatureWarning}</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Signature Preview Frame */}
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-bold text-slate-400 mb-1">
                    Transparent Signature Preview
                  </span>
                  
                  <div className="w-full h-32 rounded-2xl border border-slate-800 transparency-grid flex items-center justify-center overflow-hidden relative bg-slate-950/60 p-2 shadow-inner">
                    {signatureImage ? (
                      <>
                        <img 
                          src={signatureImage} 
                          alt="Signature preview" 
                          className="max-h-full max-w-full object-contain filter drop-shadow-sm select-none"
                        />
                        {signatureMethod === 'upload' && (
                          <button
                            type="button"
                            onClick={handleClearUpload}
                            className="absolute bottom-2 right-2 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold px-2 py-0.5 rounded text-[9px] border border-slate-700 flex items-center gap-0.5 shadow transition-colors"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            Clear
                          </button>
                        )}
                      </>
                    ) : (
                      <div className="text-slate-600 text-[10px] flex flex-col items-center gap-1">
                        <PenTool className="w-4 h-4 text-slate-750" />
                        <span>{signatureMethod === 'draw' ? 'Draw on pad' : 'Upload photo'}</span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>

            {/* Audit Trail Metadata View */}
            <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-850 text-[10px] text-slate-400 space-y-1">
              <span className="font-bold text-slate-300 tracking-wider text-xs block mb-0.5">
                DIGITAL AUDIT TRAIL METADATA
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4">
                <div>
                  <span className="font-semibold text-slate-500">System IP Address: </span>
                  <span className="text-slate-300">{ipAddress}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-500">Document Timestamp: </span>
                  <span className="text-slate-300">{new Date().toLocaleString()}</span>
                </div>
              </div>
              <div className="pt-1 border-t border-slate-900">
                <span className="font-semibold text-slate-500">User Agent: </span>
                <span className="text-slate-300 break-all">{navigator.userAgent}</span>
              </div>
            </div>

            {/* Submit Action Block */}
            {submitError && (
              <div className="flex items-start gap-2 bg-red-950/40 border border-red-900/60 rounded-2xl p-4 text-red-300 text-xs">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-200">Submission Blocked</p>
                  <p className="mt-0.5">{submitError}</p>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !isWaiverRead || !signatureImage || !!signatureWarning}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-gradient-to-r from-lime-400 to-lime-500 hover:from-lime-300 hover:to-lime-400 text-slate-950 font-extrabold transition-all duration-200 shadow-xl shadow-lime-500/5 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-lime-500/50 text-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting Consent Form...
                  </>
                ) : (
                  <>
                    Submit & Sign Consent Document
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </div>

        </form>

      </div>
    </div>
  );
}

export default App;
