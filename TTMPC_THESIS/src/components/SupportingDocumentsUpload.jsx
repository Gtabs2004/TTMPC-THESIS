import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Paperclip } from 'lucide-react';
import { supabase } from '../supabaseClient';

const DOCUMENTS = [
  { key: 'kiosk_submission', label: 'KIOSK SUBMISSION' },
  { key: 'payslip_1', label: 'PAYSLIP 1' },
  { key: 'payslip_2', label: 'PAYSLIP 2' },
];

const initialStatus = DOCUMENTS.reduce((acc, doc) => {
  acc[doc.key] = { loading: false, success: false, error: '', path: '' };
  return acc;
}, {});

const sanitizeFilename = (name) => {
  return String(name || 'file')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
};

const SupportingDocumentsUpload = ({
  bucketName = 'Supporting_Documents',
  onUploadComplete,
  accept = 'image/*,application/pdf',
}) => {
  const [status, setStatus] = useState(initialStatus);
  const inputRefs = useRef({});

  const disabled = useMemo(() => {
    return Object.values(status).some((entry) => entry.loading);
  }, [status]);

  const updateStatus = (docKey, next) => {
    setStatus((prev) => ({
      ...prev,
      [docKey]: {
        ...prev[docKey],
        ...next,
      },
    }));
  };

  const uploadDocument = async (file, docType) => {
    const fileExt = file.name.split('.').pop();
    const safeName = sanitizeFilename(file.name);
    const fileName = `${Date.now()}_${safeName}`;
    const filePath = `${docType}/${fileName}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, file, { upsert: false, contentType: file.type });

    if (error) {
      throw new Error(error.message || 'Upload failed.');
    }

    return data.path;
  };

  const handleFileChange = async (event, doc) => {
    const file = event.target.files?.[0];
    if (!file) return;

    updateStatus(doc.key, { loading: true, success: false, error: '' });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        throw new Error(userError.message || 'Unable to resolve user session.');
      }

      const role = String(user?.app_metadata?.role || '').toLowerCase();
      if (role !== 'bookkeeper') {
        throw new Error('Only bookkeeper accounts can upload supporting documents.');
      }

      const uploadedPath = await uploadDocument(file, doc.key);
      updateStatus(doc.key, {
        loading: false,
        success: true,
        error: '',
        path: uploadedPath,
      });

      if (typeof onUploadComplete === 'function') {
        onUploadComplete({
          docType: doc.key,
          fileName: file.name,
          storagePath: uploadedPath,
        });
      }
    } catch (err) {
      updateStatus(doc.key, {
        loading: false,
        success: false,
        error: err.message || 'Upload failed.',
      });
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div>
      <h2 className="flex items-center text-lg font-bold text-gray-800 mb-4">
        <Paperclip className="w-5 h-5 mr-2 text-[#1D6021]" /> Supporting Documents
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {DOCUMENTS.map((doc) => {
          const entry = status[doc.key];
          const borderClass = entry.success
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 bg-[#F8F9FA] hover:bg-gray-50';

          return (
            <div key={doc.key} className="flex flex-col">
              <button
                type="button"
                onClick={() => inputRefs.current[doc.key]?.click()}
                disabled={disabled}
                className={`border-2 border-dashed rounded-xl p-6 min-h-[118px] flex flex-col items-center justify-center transition-colors ${borderClass} disabled:opacity-60`}
              >
                {entry.loading ? (
                  <Loader2 className="w-6 h-6 text-gray-500 animate-spin mb-2" />
                ) : entry.success ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600 mb-2" />
                ) : (
                  <FileText className="w-6 h-6 text-gray-400 mb-2" />
                )}

                <p className="text-[11px] font-bold text-gray-600 uppercase tracking-wider text-center">
                  {doc.label}
                </p>
              </button>

              <input
                ref={(element) => {
                  inputRefs.current[doc.key] = element;
                }}
                type="file"
                accept={accept}
                className="hidden"
                onChange={(event) => handleFileChange(event, doc)}
              />

              {entry.error ? (
                <p className="text-xs text-red-600 mt-2">{entry.error}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SupportingDocumentsUpload;
