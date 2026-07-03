import React, { useState, useRef, useEffect } from 'react';
import { jsPDF } from 'jspdf';
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
  Building
} from 'lucide-react';

// EmailJS placeholders. Users can modify these to connect their account.
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";

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
    tripDate: '',
    college: '',
    mobile: '',
    emergencyContactName: '',
    emergencyContactPhone: ''
  });

  // UI & Processing States
  const [isWaiverRead, setIsWaiverRead] = useState(false);
  const [signatureImage, setSignatureImage] = useState(null); // base64 PNG
  const [isProcessingSignature, setIsProcessingSignature] = useState(false);
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

  // Image Processing & Brightness Validation
  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsProcessingSignature(true);
    setSignatureWarning('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Scale image down if it is huge, keeping aspect ratio
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

        // Calculate average brightness first
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Standard luma formula
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;
          totalBrightness += luma;
        }

        const avgBrightness = totalBrightness / totalPixels;

        // If overall image is too dark (average brightness below 120),
        // it means there's not enough contrast (e.g., dark photo, poor lighting, or dark paper)
        if (avgBrightness < 120) {
          setSignatureWarning('Please ensure your signature is clear and in dark ink on white paper.');
          setSignatureImage(null);
          setIsProcessingSignature(false);
          return;
        }

        // Loop through pixels and make background transparent
        // Light pixels (brightness > 180) become transparent.
        // Dark pixels (ink) are forced to a crisp solid dark charcoal/black for clarity.
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const luma = 0.299 * r + 0.587 * g + 0.114 * b;

          if (luma > 180) {
            // Set alpha to 0 (make transparent)
            data[i + 3] = 0;
          } else {
            // Force ink to deep charcoal/black
            data[i] = 20;     // R
            data[i + 1] = 20; // G
            data[i + 2] = 20; // B
            // Keep original opacity or force fully opaque
            data[i + 3] = 255;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const processedBase64 = canvas.toDataURL('image/png');
        setSignatureImage(processedBase64);
        setIsProcessingSignature(false);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleClearSignature = () => {
    setSignatureImage(null);
    setSignatureWarning('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Compile PDF document using jsPDF
  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (margin * 2);
    let yPos = 20;

    // Helper to print text and advance yPos
    const printText = (text, size = 10, style = 'normal', color = [0, 0, 0], align = 'left') => {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
      doc.setTextColor(color[0], color[1], color[2]);
      
      const lines = doc.splitTextToSize(text, contentWidth);
      lines.forEach(line => {
        if (yPos > doc.internal.pageSize.getHeight() - 25) {
          doc.addPage();
          yPos = 20;
        }
        if (align === 'center') {
          doc.text(line, pageWidth / 2, yPos, { align: 'center' });
        } else {
          doc.text(line, margin, yPos);
        }
        yPos += (size * 0.4) + 2; // Line spacing based on size
      });
    };

    // Header Title
    printText('GHUMOO WITH US', 22, 'bold', [37, 99, 235], 'center');
    yPos += 2;
    printText('Digital Consent & Liability Waiver Form', 14, 'bold', [107, 114, 128], 'center');
    yPos += 6;

    // Draw horizontal separator line
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 8;

    // Customer & Trip Info Section
    printText('1. TRIP & REGISTRANT INFORMATION', 12, 'bold', [37, 99, 235]);
    yPos += 2;

    const details = [
      ['Full Legal Name:', formData.fullName],
      ['Email Address:', formData.email],
      ['Age:', `${formData.age} years`],
      ['Trip Type:', formData.tripType],
      ['Trip Date:', formData.tripDate],
      ['College/Institution:', formData.college || 'N/A'],
      ['Mobile Number:', formData.mobile],
      ['Emergency Contact:', `${formData.emergencyContactName} (${formData.emergencyContactPhone})`]
    ];

    details.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(55, 65, 81);
      doc.text(label, margin, yPos);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      doc.text(val, margin + 45, yPos);
      
      yPos += 6;
    });
    yPos += 4;

    // Waiver Content
    printText('2. TOUR TERMS, CONDITIONS, AND LIABILITY WAIVER', 12, 'bold', [37, 99, 235]);
    yPos += 2;

    const waiverIntroduction = 'By signing this document, I voluntarily register for the tour organized by Ghumoo With Us and explicitly agree to the following terms and conditions:';
    printText(waiverIntroduction, 9.5, 'normal', [75, 85, 99]);
    yPos += 2;

    const clauses = [
      '1. Student Code of Conduct: Zero tolerance for alcohol, smoking, or drugs. Any indiscipline leads to removal without refund.',
      '2. Financial Liability: I accept full financial responsibility for any damage to property. The company is not liable for lost belongings.',
      '3. Assumption of Risk & Indemnity: I understand travel involves inherent risks. I release Ghumoo With Us from liability for personal injury, illness, or death. (CRITICAL CLAUSE)',
      '4. Medical Fitness: I confirm I am medically fit and authorize emergency medical treatment at my expense.',
      '5. Force Majeure: The company is not liable for cancellations/delays due to weather, strikes, or forest department restrictions. No refunds will be issued. (CRITICAL CLAUSE)',
      '6. Refund Policy: No refunds once the tour commences.',
      '7. Jurisdiction: Disputes are subject to the exclusive jurisdiction of courts in Kolkata, West Bengal.',
      'FINAL DECLARATION: By submitting, I agree to be bound by these terms voluntarily.'
    ];

    clauses.forEach(clause => {
      // Bold clause 3 and 5 in the PDF as well to keep visual alignment
      const isCritical = clause.includes('3. ') || clause.includes('5. ') || clause.includes('FINAL DECLARATION');
      const fontSize = isCritical ? 9.5 : 9;
      const fontStyle = isCritical ? 'bold' : 'normal';
      const fontColor = isCritical ? [17, 24, 39] : [75, 85, 99];
      
      printText(clause, fontSize, fontStyle, fontColor);
      yPos += 1;
    });
    yPos += 6;

    // Signature Area
    if (yPos > doc.internal.pageSize.getHeight() - 70) {
      doc.addPage();
      yPos = 25;
    }

    doc.setDrawColor(229, 231, 235);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 6;

    printText('3. SIGNATURE & DIGITAL ATTESTATION', 12, 'bold', [37, 99, 235]);
    yPos += 4;

    // Stamping processed signature image
    if (signatureImage) {
      try {
        // Draw a light grey bounding box for signature placement
        doc.setFillColor(249, 250, 251);
        doc.setDrawColor(229, 231, 235);
        doc.rect(margin, yPos, 60, 25, 'FD');
        
        doc.addImage(signatureImage, 'PNG', margin + 5, yPos + 2, 50, 21);
      } catch (err) {
        console.error('Failed to embed signature image in PDF:', err);
        printText('[Signature Image Render Error]', 9, 'italic', [220, 38, 38]);
      }
    }
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(55, 65, 81);
    doc.text('Authorized Digital Signatory', margin + 70, yPos + 10);
    doc.setFont('helvetica', 'bold');
    doc.text(formData.fullName, margin + 70, yPos + 16);

    yPos += 30;

    // Audit Trail Section
    if (yPos > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage();
      yPos = 25;
    }

    doc.setFillColor(243, 244, 246);
    doc.rect(margin, yPos, contentWidth, 24, 'F');
    
    // Add border to block
    doc.setDrawColor(209, 213, 219);
    doc.rect(margin, yPos, contentWidth, 24, 'D');

    yPos += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(31, 41, 55);
    doc.text('AUDIT TRAIL & SYSTEM METADATA', margin + 4, yPos);
    
    yPos += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(75, 85, 99);
    doc.text(`Timestamp: ${new Date().toLocaleString()}`, margin + 4, yPos);
    
    yPos += 3.5;
    doc.text(`IP Address: ${ipAddress}`, margin + 4, yPos);
    
    yPos += 3.5;
    const ua = navigator.userAgent;
    const truncatedUA = ua.length > 95 ? ua.substring(0, 95) + '...' : ua;
    doc.text(`User Agent: ${truncatedUA}`, margin + 4, yPos);

    // Save as Base64 Data URI
    return doc.output('datauristring');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isWaiverRead) {
      setSubmitError('Please read the liability waiver and tick the agreement checkbox.');
      return;
    }

    if (!signatureImage) {
      setSubmitError('Please upload and validate a valid signature image.');
      return;
    }

    if (signatureWarning) {
      setSubmitError('Cannot submit. Please resolve the signature contrast warning first.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // 1. Generate PDF base64
      const pdfBase64DataURI = await generatePDF();
      
      // 2. Prepare payload for EmailJS
      // Send parameters containing the base64 string
      const templateParams = {
        subject: `${formData.tripDate} - Waiver - ${formData.fullName} - ${formData.tripType}`,
        customer_name: formData.fullName,
        customer_email: formData.email,
        trip_type: formData.tripType,
        trip_date: formData.tripDate,
        mobile_number: formData.mobile,
        emergency_contact: `${formData.emergencyContactName} (${formData.emergencyContactPhone})`,
        ip_address: ipAddress,
        timestamp: new Date().toLocaleString(),
        user_agent: navigator.userAgent,
        pdf_attachment: pdfBase64DataURI // Pass PDF Base64 string directly
      };

      // 3. Dispatch using EmailJS
      if (serviceId === "YOUR_SERVICE_ID" || templateId === "YOUR_TEMPLATE_ID" || publicKey === "YOUR_PUBLIC_KEY") {
        console.log("EmailJS keys are placeholders. Simulating submission success in development mode...");
        console.log("Subject:", templateParams.subject);
        console.log("Template Params:", templateParams);
        
        // Simulating network lag
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        await emailjs.send(serviceId, templateId, templateParams, publicKey);
      }

      setIsSubmitted(true);
    } catch (err) {
      console.error('Email dispatch error:', err);
      setSubmitError(err.text || err.message || 'An error occurred while compiling or sending the waiver. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render Success Component
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 antialiased">
        <div className="w-full max-w-lg bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 text-center shadow-2xl relative overflow-hidden">
          {/* Decorative gradients */}
          <div className="absolute -top-12 -left-12 w-32 h-32 bg-blue-500/20 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-emerald-500/20 rounded-full blur-2xl"></div>

          <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/10 rounded-full mb-6 border border-emerald-500/30 text-emerald-400 relative">
            <CheckCircle2 className="w-10 h-10 animate-bounce" />
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/20 animate-ping"></div>
          </div>

          <h2 className="text-3xl font-extrabold text-white mb-3">Waiver Signed!</h2>
          <p className="text-slate-300 mb-6 text-sm md:text-base leading-relaxed">
            Thank you, <span className="font-semibold text-blue-400">{formData.fullName}</span>! Your waiver has been securely signed, timestamped, and submitted.
          </p>

          <div className="bg-slate-900/60 rounded-2xl p-5 mb-8 text-left border border-slate-700/30 space-y-3.5 text-xs text-slate-400">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>Trip Name:</span>
              <span className="font-semibold text-white">{formData.tripType}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>Trip Date:</span>
              <span className="font-semibold text-white">{formData.tripDate}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>Registered Email:</span>
              <span className="font-semibold text-white">{formData.email}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <span>IP Timestamp:</span>
              <span className="font-semibold text-white">{ipAddress}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Status:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Securely Dispatched
              </span>
            </div>
          </div>

          <p className="text-slate-400 text-xs mb-6">
            A confirmation receipt copy with the completed PDF has been sent to your email address.
          </p>

          <button
            onClick={() => {
              setIsSubmitted(false);
              setFormData({
                fullName: '',
                email: '',
                age: '',
                tripType: 'Standard Sightseeing',
                tripDate: '',
                college: '',
                mobile: '',
                emergencyContactName: '',
                emergencyContactPhone: ''
              });
              setSignatureImage(null);
              setIsWaiverRead(false);
              setScrolledToBottom(false);
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/35 focus:ring-2 focus:ring-blue-500/50"
          >
            Sign Another Consent Form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 py-8 px-4 sm:px-6 lg:px-8 text-slate-100 flex flex-col items-center antialiased">
      {/* Hidden processing canvas */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Main Container */}
      <div className="w-full max-w-4xl bg-slate-800/60 backdrop-blur-xl border border-slate-700/50 shadow-2xl rounded-3xl overflow-hidden relative">
        
        {/* Subtle glow assets */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none"></div>

        {/* Company Header */}
        <div className="pt-8 pb-6 text-center border-b border-slate-700/50 bg-slate-800/40 px-4">
          <img 
            src="/logo.png" 
            alt="Ghumoo With Us" 
            className="mx-auto w-32 md:w-36 h-auto object-contain rounded-full shadow-lg border-2 border-slate-600/40 p-1 mb-4 hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              // Fallback if logo png is not found/loaded
              e.target.style.display = 'none';
            }}
          />
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-300 to-indigo-400 bg-clip-text text-transparent sm:text-4xl">
            Ghumoo With Us
          </h1>
          <p className="mt-2 text-slate-400 text-sm md:text-base font-medium max-w-md mx-auto">
            Travel Safely. Explore Freely. Complete your pre-tour liability and indemnity release below.
          </p>
        </div>

        {/* Developer Sandbox Panel: Helps test EmailJS setup */}
        <div className="bg-slate-900/60 border-b border-slate-700/40 p-4 text-xs">
          <details className="cursor-pointer group">
            <summary className="font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-2 list-none select-none">
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
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Template ID</label>
                <input 
                  type="text" 
                  value={templateId} 
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-bold mb-1">Public Key</label>
                <input 
                  type="text" 
                  value={publicKey} 
                  onChange={(e) => setPublicKey(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
            {serviceId === "YOUR_SERVICE_ID" && (
              <p className="mt-2 text-amber-400 font-medium">
                * Currently using simulated email dispatcher. Supply actual keys above to trigger live EmailJS integration.
              </p>
            )}
          </details>
        </div>

        <form onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
          
          {/* Section 1: Trip Details */}
          <div>
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-4">
              <MapPin className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg md:text-xl font-bold text-white">1. Select Trip Details</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="tripType" className="block text-sm font-semibold text-slate-300 mb-2">
                  Trip Type *
                </label>
                <div className="relative">
                  <select
                    id="tripType"
                    name="tripType"
                    value={formData.tripType}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 appearance-none"
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

              <div>
                <label htmlFor="tripDate" className="block text-sm font-semibold text-slate-300 mb-2">
                  Trip Date *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="tripDate"
                    name="tripDate"
                    value={formData.tripDate}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 [color-scheme:dark]"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Registrant Details */}
          <div>
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-4">
              <User className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg md:text-xl font-bold text-white">2. Registrant Information</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="fullName" className="block text-sm font-semibold text-slate-300 mb-2">
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
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-slate-300 mb-2">
                  Email Address (Receipt recipient) *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    placeholder="john@example.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="age" className="block text-sm font-semibold text-slate-300 mb-2">
                  Age *
                </label>
                <input
                  type="number"
                  id="age"
                  name="age"
                  min="1"
                  max="120"
                  placeholder="e.g., 21"
                  value={formData.age}
                  onChange={handleInputChange}
                  className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  required
                />
              </div>

              <div>
                <label htmlFor="college" className="block text-sm font-semibold text-slate-300 mb-2">
                  College / Institution (Optional)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                    <Building className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    id="college"
                    name="college"
                    placeholder="e.g., Kolkata University"
                    value={formData.college}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="mobile" className="block text-sm font-semibold text-slate-300 mb-2">
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
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-10 pr-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="emergencyContactName" className="block text-sm font-semibold text-slate-300 mb-2">
                    Emergency Name *
                  </label>
                  <input
                    type="text"
                    id="emergencyContactName"
                    name="emergencyContactName"
                    placeholder="Relation / Name"
                    value={formData.emergencyContactName}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="emergencyContactPhone" className="block text-sm font-semibold text-slate-300 mb-2">
                    Emergency Phone *
                  </label>
                  <input
                    type="tel"
                    id="emergencyContactPhone"
                    name="emergencyContactPhone"
                    placeholder="Contact No."
                    value={formData.emergencyContactPhone}
                    onChange={handleInputChange}
                    className="w-full bg-slate-900/80 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Waiver Agreement */}
          <div>
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-4">
              <FileText className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg md:text-xl font-bold text-white">3. Read & Review Consent Waiver</h2>
            </div>
            
            <p className="text-xs text-slate-400 mb-3">
              Please scroll through the entire legal waiver text to acknowledge the terms and conditions.
            </p>

            <div 
              ref={waiverRef}
              onScroll={handleWaiverScroll}
              className="h-64 overflow-y-auto border border-slate-700 rounded-2xl p-5 bg-slate-900/60 custom-scrollbar space-y-4 text-xs md:text-sm text-slate-300 leading-relaxed"
            >
              <h3 className="text-center font-bold text-slate-100 border-b border-slate-800 pb-3 text-sm tracking-wide">
                TOUR TERMS, CONDITIONS, AND LIABILITY WAIVER
              </h3>
              
              <p>By proceeding, I voluntarily register for the tour organized by Ghumoo With Us.</p>
              
              <p className="pl-1">
                <span className="font-semibold text-slate-200">1. Student Code of Conduct:</span> Zero tolerance for alcohol, smoking, or drugs. Any indiscipline leads to removal without refund.
              </p>
              
              <p className="pl-1">
                <span className="font-semibold text-slate-200">2. Financial Liability:</span> I accept full financial responsibility for any damage to property. The company is not liable for lost belongings.
              </p>
              
              {/* Bold Risk Clause */}
              <div className="pl-2 border-l-2 border-amber-500/80 bg-amber-500/5 py-2 px-3 rounded-r-xl">
                <p className="font-bold text-amber-200">
                  3. Assumption of Risk & Indemnity: I understand travel involves inherent risks. I release Ghumoo With Us from liability for personal injury, illness, or death.
                </p>
              </div>
              
              <p className="pl-1">
                <span className="font-semibold text-slate-200">4. Medical Fitness:</span> I confirm I am medically fit and authorize emergency medical treatment at my expense.
              </p>
              
              {/* Bold Force Majeure Clause */}
              <div className="pl-2 border-l-2 border-amber-500/80 bg-amber-500/5 py-2 px-3 rounded-r-xl">
                <p className="font-bold text-amber-200">
                  5. Force Majeure: The company is not liable for cancellations/delays due to weather, strikes, or forest department restrictions. No refunds will be issued.
                </p>
              </div>
              
              <p className="pl-1">
                <span className="font-semibold text-slate-200">6. Refund Policy:</span> No refunds once the tour commences.
              </p>
              
              <p className="pl-1">
                <span className="font-semibold text-slate-200">7. Jurisdiction:</span> Disputes are subject to the exclusive jurisdiction of courts in Kolkata, West Bengal.
              </p>
              
              <div className="pt-3 border-t border-slate-800">
                <p className="font-bold text-slate-100 text-center">
                  FINAL DECLARATION: By submitting, I agree to be bound by these terms voluntarily.
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
                  className={`w-5 h-5 rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-900 focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
                />
              </div>
              <label htmlFor="waiverCheckbox" className="text-xs md:text-sm text-slate-300 select-none">
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

          {/* Section 4: Signature Upload */}
          <div>
            <div className="flex items-center gap-2 border-b border-slate-700 pb-2 mb-4">
              <PenTool className="w-5 h-5 text-blue-500" />
              <h2 className="text-lg md:text-xl font-bold text-white">4. Upload Ink Signature</h2>
            </div>
            
            <p className="text-xs text-slate-400 mb-4">
              Provide a clear image of your signature. Make sure it is written in <strong>dark ink on plain white paper</strong>, under clear lighting.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              
              {/* File upload trigger block */}
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
                  className="w-full flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500 hover:bg-slate-800/40 rounded-2xl p-6 transition-all duration-200 cursor-pointer text-center group"
                >
                  <div className="w-12 h-12 bg-slate-900/80 rounded-full flex items-center justify-center text-slate-400 group-hover:text-blue-400 mb-3 border border-slate-700 transition-colors">
                    {isProcessingSignature ? (
                      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    ) : (
                      <Upload className="w-6 h-6" />
                    )}
                  </div>
                  <span className="block text-sm font-semibold text-slate-200">
                    {isProcessingSignature ? 'Processing Signature...' : 'Select Signature Image'}
                  </span>
                  <span className="block text-xs text-slate-500 mt-1">
                    PNG, JPG, or WEBP (Max 10MB)
                  </span>
                </button>

                {signatureWarning && (
                  <div className="mt-4 flex items-start gap-2.5 bg-red-950/40 border border-red-900/60 rounded-xl p-3 text-red-300 text-xs">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-200">Contrast Validation Failed</p>
                      <p className="mt-0.5">{signatureWarning}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Signature Preview Block */}
              <div className="flex flex-col items-center">
                <span className="text-xs font-semibold text-slate-400 mb-2">
                  Processed Signature (Transparent Background Check)
                </span>
                
                <div className="w-full h-32 rounded-2xl border border-slate-700 transparency-grid flex items-center justify-center overflow-hidden relative bg-slate-900/80 p-2 shadow-inner">
                  {signatureImage ? (
                    <>
                      <img 
                        src={signatureImage} 
                        alt="Processed transparent ink signature preview" 
                        className="max-h-full max-w-full object-contain filter drop-shadow-sm select-none"
                      />
                      
                      <button
                        type="button"
                        onClick={handleClearSignature}
                        className="absolute bottom-2 right-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold px-2.5 py-1 rounded-lg text-[10px] border border-slate-700 flex items-center gap-1 shadow transition-colors"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                        Clear
                      </button>
                    </>
                  ) : (
                    <div className="text-slate-600 text-xs flex flex-col items-center gap-1.5">
                      <PenTool className="w-5 h-5 text-slate-700" />
                      <span>Preview will render here</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>

          {/* Audit trail metadata view */}
          <div className="bg-slate-900/50 rounded-2xl p-4 border border-slate-700/40 text-[11px] text-slate-400 space-y-1.5">
            <span className="font-bold text-slate-300 tracking-wider text-xs block mb-1">
              DIGITAL COMPLIANCE AUDIT TRAIL
            </span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 md:gap-4">
              <div>
                <span className="font-semibold text-slate-500">System IP address: </span>
                <span className="text-slate-300">{ipAddress}</span>
              </div>
              <div>
                <span className="font-semibold text-slate-500">Document Timestamp: </span>
                <span className="text-slate-300">{new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</span>
              </div>
            </div>
            <div className="pt-1.5 border-t border-slate-800">
              <span className="font-semibold text-slate-500">User Agent: </span>
              <span className="text-slate-300 break-all">{navigator.userAgent}</span>
            </div>
          </div>

          {/* Submit Action Block */}
          {submitError && (
            <div className="flex items-start gap-2 bg-red-950/40 border border-red-950 rounded-2xl p-4 text-red-300 text-xs md:text-sm">
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
              className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold transition-all duration-200 shadow-xl shadow-blue-500/10 hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500/50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating PDF & Dispatched to EmailJS...
                </>
              ) : (
                <>
                  Submit & Sign Consent Document
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}

export default App;
