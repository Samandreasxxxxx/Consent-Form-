import React, { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import emailjs from 'emailjs-com';
import { 
  FileText, 
  User, 
  Mail, 
  MapPin, 
  Phone, 
  AlertCircle, 
  CheckCircle2, 
  PenTool, 
  Upload, 
  Loader2, 
  Sparkles,
  ArrowRight,
  RefreshCw,
  HeartHandshake,
  ShieldAlert
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
    mobile: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    parentName: '' // Dynamic guardian name for minors
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

  // Check if scrolling is needed or user reached the bottom
  const checkWaiverScrollStatus = () => {
    if (waiverRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = waiverRef.current;
      // 1. If content fits completely (no scrollbar), auto-unlock.
      // 2. Or, if the user scrolled to within 15px of the bottom, unlock.
      if (scrollHeight <= clientHeight || scrollHeight - scrollTop - clientHeight < 15) {
        setScrolledToBottom(true);
      }
    }
  };

  // Monitor waiver scrolling
  const handleWaiverScroll = () => {
    checkWaiverScrollStatus();
  };

  // Run scroll status checks on mount, resize, and when resets happen
  useEffect(() => {
    // Delay slightly to let the browser paint the layout first
    const timer = setTimeout(checkWaiverScrollStatus, 300);
    
    window.addEventListener('resize', checkWaiverScrollStatus);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', checkWaiverScrollStatus);
    };
  }, [formData.tripType, isSubmitted]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Dynamic signature pad resizing for retina display crispness & alignment
  const resizeCanvas = () => {
    if (sigPadRef.current) {
      const canvas = sigPadRef.current.getCanvas();
      if (canvas) {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const targetWidth = canvas.offsetWidth;
        const targetHeight = canvas.offsetHeight;
        
        if (canvas.width !== targetWidth * ratio || canvas.height !== targetHeight * ratio) {
          const data = sigPadRef.current.toData();
          canvas.width = targetWidth * ratio;
          canvas.height = targetHeight * ratio;
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.scale(ratio, ratio);
          sigPadRef.current.clear();
          sigPadRef.current.fromData(data);
        }
      }
    }
  };

  // Run signature resize checks on mount and method toggle
  useEffect(() => {
    if (signatureMethod === 'draw') {
      const timer = setTimeout(resizeCanvas, 400);
      window.addEventListener('resize', resizeCanvas);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, [signatureMethod]);

  // 1. Drawing Pad Actions
  const handleDrawEnd = () => {
    if (sigPadRef.current) {
      if (!sigPadRef.current.isEmpty()) {
        try {
          const base64 = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
          setSignatureImage(base64);
        } catch (err) {
          console.warn('Trimmed canvas failed, using raw canvas:', err);
          const base64 = sigPadRef.current.getCanvas().toDataURL('image/png');
          setSignatureImage(base64);
        }
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
        trip_date: tripDateString,
        signature_image: signatureImage,
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
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 antialiased text-zinc-800">
        <div className="w-full max-w-lg bg-white border border-zinc-200 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-rose-500/5 rounded-full blur-2xl"></div>

          <div className="inline-flex items-center justify-center w-20 h-20 bg-rose-50 rounded-full mb-6 border border-rose-100 text-rose-500 relative">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
            <div className="absolute inset-0 rounded-full border-2 border-rose-400/20 animate-ping"></div>
          </div>

          <h2 className="text-3xl font-extrabold text-zinc-900 mb-3">Waiver Submitted!</h2>
          <p className="text-zinc-600 mb-6 text-sm md:text-base leading-relaxed">
            Thank you, <span className="font-semibold text-rose-500">{formData.fullName}</span>! Your waiver has been securely signed and submitted.
          </p>

          <div className="bg-zinc-50 rounded-2xl p-5 mb-8 text-left border border-zinc-200 space-y-3.5 text-xs text-zinc-500">
            <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
              <span>Trip Category:</span>
              <span className="font-semibold text-zinc-900">{formData.tripType}</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
              <span>Submission Date:</span>
              <span className="font-semibold text-zinc-900">{new Date().toLocaleDateString()}</span>
            </div>
            <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
              <span>Registered Email:</span>
              <span className="font-semibold text-zinc-900">{formData.email}</span>
            </div>
            {isMinor && (
              <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
                <span>Parent/Guardian:</span>
                <span className="font-semibold text-zinc-900">{formData.parentName}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-b border-zinc-200 pb-2">
              <span>System IP:</span>
              <span className="font-semibold text-zinc-900">{ipAddress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Delivery Status:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                Securely Dispatched
              </span>
            </div>
          </div>

          <p className="text-zinc-400 text-xs mb-6">
            A confirmation copy with your details and signature has been sent to your email.
          </p>

          <button
            onClick={() => {
              setIsSubmitted(false);
              setFormData({
                fullName: '',
                email: '',
                age: '',
                tripType: 'Standard Sightseeing',
                mobile: '',
                emergencyContactName: '',
                emergencyContactPhone: '',
                parentName: ''
              });
              setSignatureImage(null);
              setIsWaiverRead(false);
              setScrolledToBottom(false);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold transition-all duration-200 shadow-md shadow-rose-600/10 hover:shadow-rose-600/25 focus:ring-2 focus:ring-rose-500/50"
          >
            Sign Another Consent Form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 sm:px-6 lg:px-8 text-zinc-800 flex flex-col items-center antialiased">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Container */}
      <div className="w-full max-w-7xl bg-white border border-zinc-200 shadow-xl rounded-3xl overflow-hidden relative">
        
        {/* Subtle glow backdrops */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-500/2 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-emerald-500/2 rounded-full blur-3xl -z-10 pointer-events-none"></div>

        {/* Company Header */}
        <div className="pt-8 pb-6 text-center border-b border-zinc-100 bg-zinc-50/50 px-4">
          <img 
            src="/logo.png" 
            alt="Ghumoo With Us" 
            className="mx-auto w-32 md:w-36 h-auto object-contain rounded-full shadow-md border border-zinc-200 p-1 mb-4 hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              e.target.style.display = 'none';
            }}
          />
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 sm:text-4xl">
            GHUMOO WITH US
          </h1>
          <p className="mt-2 text-zinc-500 text-sm md:text-base font-semibold max-w-md mx-auto">
            Digital Waiver & Tour Consent Form
          </p>
        </div>



        {/* Main Grid: Split Column Landscape Layout */}
        <form onSubmit={handleSubmit} className="p-6 md:p-8 lg:grid lg:grid-cols-12 lg:gap-8 space-y-8 lg:space-y-0">
          
          {/* LEFT COLUMN: Input Details, Signature, Audit Trail, and Submit Button (col-span-5) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Section 1: Trip Details */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-2 mb-4">
                <MapPin className="w-5 h-5 text-rose-500" />
                <h2 className="text-base md:text-lg font-bold text-zinc-900">1. Select Trip Details</h2>
              </div>
              
              <div>
                <label htmlFor="tripType" className="block text-xs font-semibold text-zinc-600 mb-2">
                  Trip Type *
                </label>
                <div className="relative">
                  <select
                    id="tripType"
                    name="tripType"
                    value={formData.tripType}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-3 text-zinc-900 font-medium focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 appearance-none text-sm cursor-pointer"
                    required
                  >
                    {TRIP_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-zinc-400">
                    ▼
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Registrant Details */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-5">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-2 mb-1">
                <User className="w-5 h-5 text-rose-500" />
                <h2 className="text-base md:text-lg font-bold text-zinc-900">2. Personal Information</h2>
              </div>

              <div>
                <label htmlFor="fullName" className="block text-xs font-semibold text-zinc-600 mb-2">
                  Full Legal Name *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    id="fullName"
                    name="fullName"
                    placeholder="John Doe"
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="w-full bg-white border border-zinc-300 rounded-xl pl-10 pr-4 py-3 text-zinc-900 placeholder-zinc-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="email" className="block text-xs font-semibold text-zinc-600 mb-2">
                    Email Address *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      placeholder="john@email.com"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-zinc-300 rounded-xl pl-10 pr-4 py-3 text-zinc-900 placeholder-zinc-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 text-sm"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="age" className="block text-xs font-semibold text-zinc-600 mb-2">
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
                    className="w-full bg-white border border-zinc-300 rounded-xl px-4 py-3 text-zinc-900 placeholder-zinc-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 text-sm"
                    required
                  />
                </div>
              </div>

              {/* Dynamic Minor Parent/Guardian Field */}
              {isMinor && (
                <div className="animate-fade-in bg-amber-50 border border-amber-200 p-4 rounded-xl space-y-3">
                  <div className="flex items-center gap-2 text-amber-800 font-semibold text-xs">
                    <HeartHandshake className="w-4 h-4 shrink-0 text-amber-600" />
                    <span>Minor Consent Required (Age under 18)</span>
                  </div>
                  <div>
                    <label htmlFor="parentName" className="block text-xs font-semibold text-zinc-700 mb-2">
                      Parent / Guardian Full Name *
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                        <User className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        id="parentName"
                        name="parentName"
                        placeholder="Guardian's Legal Name"
                        value={formData.parentName}
                        onChange={handleInputChange}
                        className="w-full bg-white border border-amber-300 rounded-xl pl-10 pr-4 py-3 text-zinc-900 placeholder-zinc-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 text-sm"
                        required={isMinor}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label htmlFor="mobile" className="block text-xs font-semibold text-zinc-600 mb-2">
                    Mobile Number *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-zinc-400 pointer-events-none">
                      <Phone className="w-4 h-4" />
                    </span>
                    <input
                      type="tel"
                      id="mobile"
                      name="mobile"
                      placeholder="e.g., +91 98765 43210"
                      value={formData.mobile}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-zinc-300 rounded-xl pl-10 pr-4 py-3 text-zinc-900 placeholder-zinc-400 focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all duration-200 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200 grid grid-cols-2 gap-3">
                  <div className="col-span-2 text-xs font-bold text-zinc-700 mb-0.5">Emergency Contact Details</div>
                  <div>
                    <label htmlFor="emergencyContactName" className="block text-[10px] font-bold text-zinc-500 mb-1">
                      Emergency Name *
                    </label>
                    <input
                      type="text"
                      id="emergencyContactName"
                      name="emergencyContactName"
                      placeholder="Relation / Name"
                      value={formData.emergencyContactName}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:ring-1 focus:ring-rose-500 focus:border-transparent transition-all text-xs"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="emergencyContactPhone" className="block text-[10px] font-bold text-zinc-500 mb-1">
                      Emergency Phone *
                    </label>
                    <input
                      type="tel"
                      id="emergencyContactPhone"
                      name="emergencyContactPhone"
                      placeholder="Contact No."
                      value={formData.emergencyContactPhone}
                      onChange={handleInputChange}
                      className="w-full bg-white border border-zinc-300 rounded-lg px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:ring-1 focus:ring-rose-500 focus:border-transparent transition-all text-xs"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 3: Signature Component */}
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-2">
                <PenTool className="w-5 h-5 text-rose-500" />
                <h2 className="text-base md:text-lg font-bold text-zinc-900">
                  {isMinor ? "3. Parent / Guardian Consent Signature" : "3. Provide Consent Signature"}
                </h2>
              </div>
              
              <p className="text-xs text-zinc-500">
                {isMinor 
                  ? "As the participant is a minor, the parent/guardian must sign below."
                  : "Please choose your signature format: draw on the pad or upload an image."}
              </p>

              {/* Method Tabs */}
              <div className="flex border-b border-zinc-200 max-w-xs">
                <button
                  type="button"
                  onClick={() => handleTabChange('draw')}
                  className={`flex-1 pb-2 text-xs font-semibold border-b-2 text-center transition-all duration-200 ${
                    signatureMethod === 'draw' 
                      ? 'border-rose-500 text-rose-500' 
                      : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  ✏️ Draw Pad
                </button>
                <button
                  type="button"
                  onClick={() => handleTabChange('upload')}
                  className={`flex-1 pb-2 text-xs font-semibold border-b-2 text-center transition-all duration-200 ${
                    signatureMethod === 'upload' 
                      ? 'border-rose-500 text-rose-500' 
                      : 'border-transparent text-zinc-400 hover:text-zinc-600'
                  }`}
                >
                  📂 Upload Photo
                </button>
              </div>

              {/* Signature Area */}
              <div>
                
                {/* Tab 1: Draw Signature Pad (Full Width, No Preview) */}
                {signatureMethod === 'draw' && (
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-zinc-450 mb-1 text-center block">
                      Signature Pad (Draw here)
                    </span>
                    <div className="border border-zinc-200 rounded-2xl overflow-hidden bg-white p-1 relative shadow-sm">
                      <SignatureCanvas 
                        ref={sigPadRef}
                        penColor="black"
                        onEnd={handleDrawEnd}
                        canvasProps={{
                          className: "w-full h-32 cursor-crosshair rounded-xl"
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleClearDraw}
                        className="absolute bottom-2 right-2 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold px-2 py-0.5 rounded text-[9px] border border-zinc-200 flex items-center gap-0.5 shadow-sm transition-colors z-10"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                {/* Tab 2: Upload File Panel & Preview (Symmetric Grid Layout) */}
                {signatureMethod === 'upload' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                    {/* Left Column: Upload */}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-450 mb-1 text-center block">
                        Signature Upload (Select photo)
                      </span>
                      <div className="relative w-full h-32">
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
                          className="w-full h-full flex flex-col items-center justify-center border border-zinc-200 hover:border-rose-500 hover:bg-rose-50/20 rounded-2xl transition-all duration-200 cursor-pointer text-center group bg-zinc-50 shadow-sm"
                        >
                          <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-zinc-400 group-hover:text-rose-500 mb-1 border border-zinc-200 transition-colors shadow-sm">
                            {isProcessingUpload ? (
                              <Loader2 className="w-4 h-4 animate-spin text-rose-500" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                          </div>
                          <span className="block text-xs font-semibold text-zinc-700">
                            {isProcessingUpload ? 'Processing Signature...' : 'Select Signature Photo'}
                          </span>
                          <span className="block text-[9px] text-zinc-400">
                            Dark ink on white paper
                          </span>
                        </button>
                      </div>

                      {signatureWarning && (
                        <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-2.5 text-red-700 text-[10px]">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-500 mt-0.5" />
                          <div>
                            <p className="font-semibold text-red-800">Contrast Warning</p>
                            <p className="mt-0.5 text-[9px]">{signatureWarning}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column: Preview */}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-zinc-450 mb-1 text-center block">
                        Transparent Preview
                      </span>
                      
                      <div className="w-full h-32 rounded-2xl border border-zinc-200 transparency-grid flex items-center justify-center overflow-hidden relative bg-zinc-50 p-2 shadow-inner">
                        {signatureImage ? (
                          <>
                            <img 
                              src={signatureImage} 
                              alt="Signature preview" 
                              className="max-h-full max-w-full object-contain filter drop-shadow-sm select-none"
                            />
                            <button
                              type="button"
                              onClick={handleClearUpload}
                              className="absolute bottom-2 right-2 bg-white hover:bg-zinc-100 text-zinc-700 font-semibold px-2 py-0.5 rounded text-[9px] border border-zinc-200 flex items-center gap-0.5 shadow-sm transition-colors"
                            >
                              <RefreshCw className="w-2.5 h-2.5" />
                              Clear
                            </button>
                          </>
                        ) : (
                          <div className="text-zinc-400 text-[10px] flex flex-col items-center gap-1">
                            <PenTool className="w-4 h-4 text-zinc-300" />
                            <span>Upload photo</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            </div>

            {/* Audit Trail Metadata View */}
            <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-200 text-[10px] text-zinc-500 space-y-1 shadow-inner">
              <span className="font-bold text-zinc-700 tracking-wider text-xs block mb-0.5">
                DIGITAL AUDIT TRAIL METADATA
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1 md:gap-4">
                <div>
                  <span className="font-semibold text-zinc-400">System IP Address: </span>
                  <span className="text-zinc-600">{ipAddress}</span>
                </div>
                <div>
                  <span className="font-semibold text-zinc-400">Document Timestamp: </span>
                  <span className="text-zinc-600">{new Date().toLocaleString()}</span>
                </div>
              </div>
              <div className="pt-1 border-t border-zinc-200">
                <span className="font-semibold text-zinc-400">User Agent: </span>
                <span className="text-zinc-600 break-all">{navigator.userAgent}</span>
              </div>
            </div>

            {/* Submit Action Block */}
            {submitError && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700 text-xs">
                <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-red-800">Submission Blocked</p>
                  <p className="mt-0.5">{submitError}</p>
                </div>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-650 text-white font-extrabold transition-all duration-200 shadow-md shadow-rose-500/10 disabled:opacity-50 focus:ring-2 focus:ring-rose-500/50 text-sm cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
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

          {/* RIGHT COLUMN: Elongated Consent Waiver Box (col-span-7) */}
          <div className="lg:col-span-7 flex flex-col h-full">
            
            <div className="bg-white p-5 rounded-2xl border border-zinc-200 flex flex-col h-full flex-1 shadow-sm">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-2 mb-3">
                <FileText className="w-5 h-5 text-rose-500" />
                <h2 className="text-base md:text-lg font-bold text-zinc-900">4. Review Consent Waiver</h2>
              </div>
              
              {/* Elongated scrolling waiver content */}
              <div 
                ref={waiverRef}
                onScroll={handleWaiverScroll}
                className="flex-1 overflow-y-auto border border-zinc-200 rounded-2xl p-5 bg-zinc-50 custom-scrollbar space-y-4 text-xs text-zinc-655 leading-relaxed h-[360px] lg:h-auto"
              >
                <h3 className="text-center font-extrabold text-zinc-900 border-b border-zinc-200 pb-3 text-[13px] tracking-wide">
                  TOUR TERMS, CONDITIONS, AND LIABILITY WAIVER
                </h3>
                
                <p className="italic text-zinc-500 text-center text-[11px]">
                  By proceeding with this submission, I, the participant (or my parent/guardian if I am under 18 years of age) whose details are specified in the accompanying form, hereby voluntarily register for the tour organized by Ghumoo With Us and unconditionally agree to the following legally binding terms:
                </p>
                
                <div className="space-y-3">
                  <p className="font-bold text-zinc-800 text-[11px]">1. Participant Code of Conduct & Discipline</p>
                  <ul className="list-disc pl-5 space-y-1 text-zinc-600">
                    <li><span className="font-semibold text-zinc-800">Zero-Tolerance Policy:</span> The consumption, possession, or distribution of alcohol, cigarettes, e-cigarettes, vapes, drugs, or any illegal intoxicating substances is strictly prohibited throughout the entire duration of the tour (including transit and hotel stays).</li>
                    <li><span className="font-semibold text-zinc-800">Compliance:</span> I agree to strictly adhere to the itinerary timings, safety instructions, and decisions made by the assigned Tour Leader and organizers.</li>
                    <li><span className="font-semibold text-zinc-800">Expulsion without Refund:</span> Any instance of misbehavior, indiscipline, late reporting, or failure to follow instructions will result in immediate removal from the tour. In such cases, the company is not liable to provide any alternative transport, accommodation, or financial refund.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-zinc-800 text-[11px]">2. Financial Liability & Property Damage</p>
                  <ul className="list-disc pl-5 space-y-1 text-zinc-600">
                    <li><span className="font-semibold text-zinc-800">Property Damage:</span> I accept full financial responsibility for any damage caused by me to hotel rooms, vehicles, public property, or third-party equipment during the tour. All repair or replacement costs must be settled by me immediately on-site.</li>
                    <li><span className="font-semibold text-zinc-800">Personal Belongings:</span> Ghumoo With Us acts solely as a facilitator. The company, its employees, and coordinators accept zero liability for the loss, theft, or damage of personal belongings, including mobile phones, wallets, cameras, luggage, or cash.</li>
                  </ul>
                </div>
                
                {/* Bold Risk Clause */}
                <div className="pl-3 border-l-2 border-rose-500 bg-rose-50/50 py-2 px-3 rounded-r-xl">
                  <p className="font-bold text-rose-700 text-[11px] mb-1">3. Absolute Assumption of Risk & Indemnity</p>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-700">
                    <li><span className="font-bold">Inherent Risks:</span> I understand that travel, sightseeing, and adventure/wildlife activities involve inherent risks of delay, illness, personal injury, or unforeseen hazards.</li>
                    <li><span className="font-bold">Release of Liability:</span> I voluntarily assume all risks associated with my participation. I hereby release, acquit, and forever discharge Ghumoo With Us, its directors, partners, and field staff from any and all legal claims, liabilities, demands, or lawsuits arising out of any personal injury, severe bodily harm, illness, medical emergency, or accidental death during the tour.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-zinc-800 text-[11px]">4. Medical Fitness & Emergency Authorization</p>
                  <ul className="list-disc pl-5 space-y-1 text-zinc-600">
                    <li>I certify that I am mentally and physically fit to undertake this travel itinerary. I have transparently disclosed any pre-existing medical conditions to the organizers prior to departure.</li>
                    <li>In the event of a medical emergency, I authorize the tour coordinators to arrange for local medical treatment, hospitalization, or first-aid at my sole financial expense.</li>
                  </ul>
                </div>
                
                {/* Bold Force Majeure Clause */}
                <div className="pl-3 border-l-2 border-rose-500 bg-rose-50/50 py-2 px-3 rounded-r-xl">
                  <p className="font-bold text-rose-700 text-[11px] mb-1">5. Force Majeure & Third-Party Service Limitations</p>
                  <ul className="list-disc pl-4 space-y-1 text-zinc-700">
                    <li>Ghumoo With Us relies on third-party vendors (hotels, transport operators, safari vehicles). The company is not liable for deficiencies in service, accidents, or delays caused by these independent vendors.</li>
                    <li><span className="font-bold">Unforeseen Events:</span> The company is not liable for tour cancellations, changes in itinerary, or incomplete sightseeing caused by Force Majeure events—including but not limited to landslides, floods, extreme weather, political strikes (bandhs), riots, road blockades, or sudden government/forest department restrictions. No refunds or compensations will be issued under these circumstances.</li>
                  </ul>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-zinc-800 text-[11px]">6. Refund and Cancellation Policy</p>
                  <p className="pl-1 text-zinc-600">
                    Once the tour has commenced, no refunds, partial or full, will be provided for unutilized services, voluntary dropouts, or disciplinary expulsions.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-zinc-800 text-[11px]">7. Media Content Release</p>
                  <p className="pl-1 text-zinc-600">
                    I hereby grant Ghumoo With Us the absolute right and permission to use any photographs, videos, or digital media captured of me during the tour for promotional, social media marketing, and internal record purposes without requiring further compensation or approval.
                  </p>
                </div>

                <div className="space-y-3">
                  <p className="font-bold text-zinc-800 text-[11px]">8. Governing Law and Legal Jurisdiction</p>
                  <p className="pl-1 text-zinc-600">
                    This agreement shall be governed by and construed in accordance with the laws of India. Any legal disputes, claims, or proceedings arising out of this contract shall be subject to the exclusive jurisdiction of the competent courts in Kolkata, West Bengal only.
                  </p>
                </div>
                
                <div className="pt-4 border-t border-zinc-200">
                  <p className="font-bold text-zinc-900 text-center">
                    FINAL DECLARATION
                  </p>
                  <p className="mt-1 font-bold text-zinc-650 text-center text-[10px]">
                    By providing my digital/uploaded signature below, I acknowledge that I have read this entire document carefully, understood its legal implications, and agree to be bound by all its terms voluntarily and under my own free will.
                  </p>
                </div>
              </div>

              {/* Checkbox wrapper */}
              <div className="mt-4 flex items-start gap-3 border-t border-zinc-200 pt-3">
                <div className="flex items-center h-5">
                  <input
                    id="waiverCheckbox"
                    type="checkbox"
                    disabled={!scrolledToBottom}
                    checked={isWaiverRead}
                    onChange={(e) => setIsWaiverRead(e.target.checked)}
                    className="w-5 h-5 rounded border-zinc-300 text-rose-600 focus:ring-rose-500 bg-white focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                </div>
                <label htmlFor="waiverCheckbox" className="text-xs text-zinc-700 select-none">
                  {!scrolledToBottom ? (
                    <span className="text-amber-600 font-medium">
                      ⚠️ Please scroll to the bottom of the waiver to enable and agree to these terms.
                    </span>
                  ) : (
                    <span>I have read, understood, and agree to the <strong>Tour Terms, Conditions, and Liability Waiver</strong> above.</span>
                  )}
                </label>
              </div>
            </div>

          </div>

        </form>

      </div>
    </div>
  );
}

export default App;
