import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  sendEmailVerificationCode,
  sendPhoneVerificationCode,
  verifyEmailAddress,
  verifyPhoneNumber,
  requestEmailChangeVerification,
  verifyChangedEmailAddress
} from '../lib/authApi';
import { Edit, Info } from 'lucide-react';
import type { ProfileResponse, UpdateProfileRequest } from '../lib/authApi';
import { formatVerificationCountdown, getVerificationSecondsRemaining } from '../lib/verificationTimer';
import './Profile.css';

type ProfileProps = {
  onProfileUpdated?: (profile: ProfileResponse) => void;
  onNavigate?: (view: string) => void;
};

type VerificationTarget = 'phone' | 'email';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

const normalizePhoneNumber = (rawPhone: string): string => {
  const normalized = String(rawPhone || '').trim();
  if (!normalized) return '';

  const compactNumber = normalized.replace(/[()\-\s]/g, '');
  if (compactNumber.startsWith('+63')) {
    return `0${compactNumber.slice(3)}`;
  }
  if (compactNumber.startsWith('63')) {
    return `0${compactNumber.slice(2)}`;
  }
  if (compactNumber.startsWith('9') && compactNumber.length === 10) {
    return `0${compactNumber}`;
  }

  return compactNumber;
};

const normalizeEmailAddress = (rawEmail: string): string => String(rawEmail || '').trim().toLowerCase();
const isValidEmailAddress = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isCompletePhoneNumber = (normalizedPhone: string): boolean => /^09\d{9}$/.test(normalizedPhone);
const VERIFICATION_CODE_LENGTH = 6;

export default function Profile({ onProfileUpdated, onNavigate }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingPrimaryLogin, setUpdatingPrimaryLogin] = useState(false);
  const [pendingEmailPrimaryActivation, setPendingEmailPrimaryActivation] = useState(false);
  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [sendingPhoneCode, setSendingPhoneCode] = useState(false);
  const [confirmingVerificationCode, setConfirmingVerificationCode] = useState(false);
  const [showEmailChangeModal, setShowEmailChangeModal] = useState(false);
  const [emailChangeDraft, setEmailChangeDraft] = useState('');
  const [emailChangeCode, setEmailChangeCode] = useState('');
  const [emailChangeStep, setEmailChangeStep] = useState<'email' | 'verify'>('email');
  const [requestingEmailChange, setRequestingEmailChange] = useState(false);
  const [confirmingEmailChange, setConfirmingEmailChange] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState('');
  const [emailChangeDestination, setEmailChangeDestination] = useState('');
  const [emailChangeExpiresAt, setEmailChangeExpiresAt] = useState('');
  const [emailChangeSecondsRemaining, setEmailChangeSecondsRemaining] = useState<number | null>(null);
  const [phoneEditMode, setPhoneEditMode] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationTarget, setVerificationTarget] = useState<VerificationTarget>('phone');
  const [verificationDigits, setVerificationDigits] = useState<string[]>(() => Array(VERIFICATION_CODE_LENGTH).fill(''));
  const [verificationChannel, setVerificationChannel] = useState<'sms' | 'email'>('sms');
  const [verificationEmailProvider, setVerificationEmailProvider] = useState<'gmail-api' | 'semaphore' | 'sendgrid' | 'sms-api-ph' | ''>('');
  const [verificationDestination, setVerificationDestination] = useState('');
  const [verificationDeliveryStatus, setVerificationDeliveryStatus] = useState('');
  const [verificationMessageId, setVerificationMessageId] = useState('');
  const [verificationProviderMessage, setVerificationProviderMessage] = useState('');
  const [verificationFallbackReason, setVerificationFallbackReason] = useState('');
  const [verificationExpiresAt, setVerificationExpiresAt] = useState('');
  const [verificationSecondsRemaining, setVerificationSecondsRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const verificationCodeInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const toastTimerRef = useRef<number | null>(null);

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    username: '',
  });

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setFormData({
          displayName: p.displayName,
          email: p.email,
          phone: p.phone || '',
          username: p.username,
        });
        setPhoneEditMode(false);
        setAvatarLoadError(false);
      })
      .catch((err) =>
        setStatus({
          type: 'error',
          message: err instanceof Error ? err.message : 'Failed to load profile',
        })
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (showVerificationModal) {
      verificationCodeInputRefs.current[0]?.focus();
    }
  }, [showVerificationModal]);

  useEffect(() => {
    if (!showVerificationModal || !verificationExpiresAt) {
      setVerificationSecondsRemaining(null);
      return;
    }

    const updateCountdown = () => {
      setVerificationSecondsRemaining(getVerificationSecondsRemaining(verificationExpiresAt));
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [showVerificationModal, verificationExpiresAt]);

  useEffect(() => {
    if (!showEmailChangeModal || emailChangeStep !== 'verify' || !emailChangeExpiresAt) {
      setEmailChangeSecondsRemaining(null);
      return;
    }

    const updateCountdown = () => {
      setEmailChangeSecondsRemaining(getVerificationSecondsRemaining(emailChangeExpiresAt));
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(intervalId);
  }, [showEmailChangeModal, emailChangeStep, emailChangeExpiresAt]);

  const showToastNotification = (type: 'error' | 'success', message: string) => {
    setStatus({ type, message });
    setShowToast(true);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setShowToast(false);
    }, 3000) as unknown as number;
  };

  const isDirty = useMemo(() => {
    if (!profile) return false;
    return (
      formData.displayName !== profile.displayName ||
      formData.email !== profile.email ||
      normalizePhoneNumber(formData.phone) !== normalizePhoneNumber(profile.phone || '')
    );
  }, [formData, profile]);

  const accountTypeLabel = useMemo(() => {
    if (!profile) return '';
    return `${profile.accountType.charAt(0).toUpperCase()}${profile.accountType.slice(1)}`;
  }, [profile]);

  const normalizedEmailInput = useMemo(() => normalizeEmailAddress(formData.email), [formData.email]);
  const normalizedProfileEmail = useMemo(() => normalizeEmailAddress(profile?.email || ''), [profile?.email]);
  const hasEmailInput = Boolean(normalizedEmailInput);
  const isEmailComplete = isValidEmailAddress(normalizedEmailInput);
  const isStoredEmailVerified = Boolean(profile?.emailVerified) && Boolean(normalizedProfileEmail);
  const isCurrentEmailStored = Boolean(normalizedEmailInput) && normalizedEmailInput === normalizedProfileEmail;
  const activeEmailIsVerified = isStoredEmailVerified && isCurrentEmailStored;
  const primaryLoginMethod = profile?.primaryLoginMethod === 'email' ? 'email' : 'username';
  const isEmailPrimaryLogin = primaryLoginMethod === 'email';
  const usingEmailForGoogleSignIn = activeEmailIsVerified && isEmailPrimaryLogin;
  const accountIsVerified = activeEmailIsVerified;
  const showEmailPrimaryActionButton = isEmailComplete && !isEmailPrimaryLogin;
  const showChangeEmailButton = usingEmailForGoogleSignIn;
  const showEmailActionButton = showEmailPrimaryActionButton || showChangeEmailButton;
  const emailVerificationHint = isEmailPrimaryLogin
    ? 'Email address is verified and enabled for Google sign-in. Click Change Email to replace it safely.'
    : isEmailComplete
      ? (activeEmailIsVerified
        ? 'Click Make Primary to enable Google sign-in with this verified email.'
        : 'Click Make Primary to verify this email and enable Google sign-in.')
      : hasEmailInput
        ? 'Enter a valid email address to enable Google sign-in.'
        : 'Add an email address to enable Google sign-in.';
  const usernameLoginHint = 'Username remains available for manual sign-in.';

  const normalizedPhoneInput = useMemo(() => normalizePhoneNumber(formData.phone), [formData.phone]);
  const normalizedProfilePhone = useMemo(() => normalizePhoneNumber(profile?.phone || ''), [profile?.phone]);
  const hasPhoneInput = Boolean(formData.phone.trim());
  const isPhoneComplete = isCompletePhoneNumber(normalizedPhoneInput);
  const isStoredPhoneVerified = Boolean(profile?.phoneVerified) && Boolean(normalizedProfilePhone);
  const isCurrentPhoneStored = Boolean(normalizedPhoneInput) && normalizedPhoneInput === normalizedProfilePhone;
  const activePhoneIsVerified = isStoredPhoneVerified && isCurrentPhoneStored;
  const phoneInputLocked = activePhoneIsVerified && !phoneEditMode;
  const showVerifyButton = !activePhoneIsVerified && isPhoneComplete;
  const showPhoneActionButton = activePhoneIsVerified || showVerifyButton;
  const phoneVerificationHint = activePhoneIsVerified
    ? 'Phone number is verified.'
    : showVerifyButton
      ? 'Click Verify to confirm this number through SMS.'
      : hasPhoneInput
        ? 'Enter a complete 11-digit mobile number to enable verification.'
        : 'Add a mobile number, then verify it through SMS.';

  const handleSetPrimaryLoginMethod = async (nextMethod: 'username' | 'email') => {
    if (!profile) return;

    if (nextMethod === primaryLoginMethod) {
      return;
    }

    if (nextMethod === 'email' && !activeEmailIsVerified) {
      showToastNotification('error', 'Verify your email address before making it primary.');
      return;
    }

    setUpdatingPrimaryLogin(true);
    setStatus(null);

    try {
      const updatedProfile = await updateProfile({ primaryLoginMethod: nextMethod });
      setProfile(updatedProfile);
      setFormData((prev) => ({
        ...prev,
        username: updatedProfile.username,
        displayName: updatedProfile.displayName,
        email: updatedProfile.email,
        phone: updatedProfile.phone || '',
      }));
      showToastNotification(
        'success',
        nextMethod === 'email'
          ? 'Email is now enabled for Google sign-in.'
          : 'Google sign-in primary email was cleared.'
      );
      onProfileUpdated?.(updatedProfile);
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to update the Google sign-in email.');
    } finally {
      setUpdatingPrimaryLogin(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const sanitizedPhone = value.replace(/[^\d+\-\s()]/g, '');
      setFormData((prev) => ({ ...prev, [name]: sanitizedPhone }));
      if (profile?.phoneVerified) {
        const normalizedIncomingPhone = normalizePhoneNumber(sanitizedPhone);
        if (normalizedIncomingPhone !== normalizedProfilePhone) {
          setPhoneEditMode(true);
        }
      }
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEmailPrimaryAction = async () => {
    if (!profile) return;

    if (!isEmailComplete) {
      showToastNotification('error', 'Enter a valid email address before making it primary.');
      return;
    }

    if (activeEmailIsVerified && isCurrentEmailStored) {
      await handleSetPrimaryLoginMethod('email');
      return;
    }

    setPendingEmailPrimaryActivation(true);
    setSendingEmailCode(true);
    setStatus(null);

    try {
      const sendResult = await sendEmailVerificationCode(normalizedEmailInput);
      setVerificationTarget('email');
      setVerificationChannel('email');
      setVerificationEmailProvider(sendResult.emailProvider || '');
      setVerificationDestination(sendResult.destination || sendResult.email || normalizedEmailInput);
      setVerificationDeliveryStatus(sendResult.deliveryStatus || 'accepted');
      setVerificationMessageId(sendResult.messageId || '');
      setVerificationProviderMessage(String(sendResult.providerMessage || '').trim());
      setVerificationFallbackReason('');
      setVerificationExpiresAt(sendResult.expiresAt || '');
      setVerificationDigits(Array(VERIFICATION_CODE_LENGTH).fill(''));
      setShowVerificationModal(true);
      showToastNotification('success', 'Verification code sent. Enter it to verify this email and make it primary.');
    } catch (err) {
      setPendingEmailPrimaryActivation(false);
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to verify email address.');
    } finally {
      setSendingEmailCode(false);
    }
  };

  const openEmailChangeModal = () => {
    setShowEmailChangeModal(true);
    setEmailChangeDraft('');
    setEmailChangeCode('');
    setEmailChangeStep('email');
    setEmailChangeError('');
    setEmailChangeDestination('');
    setEmailChangeExpiresAt('');
  };

  const resetEmailChangeModal = () => {
    setShowEmailChangeModal(false);
    setEmailChangeDraft('');
    setEmailChangeCode('');
    setEmailChangeStep('email');
    setEmailChangeError('');
    setEmailChangeDestination('');
    setEmailChangeExpiresAt('');
  };

  const closeEmailChangeModal = () => {
    if (requestingEmailChange || confirmingEmailChange) return;
    resetEmailChangeModal();
  };

  const submitEmailChangeRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedDraft = normalizeEmailAddress(emailChangeDraft);
    if (!isValidEmailAddress(normalizedDraft)) {
      setEmailChangeError('Enter a valid replacement email address.');
      return;
    }

    if (normalizedDraft === normalizedProfileEmail) {
      setEmailChangeError('Enter a different email address to continue.');
      return;
    }

    setRequestingEmailChange(true);
    setEmailChangeError('');

    try {
      const result = await requestEmailChangeVerification(normalizedDraft);
      setEmailChangeDraft(result.email || normalizedDraft);
      setEmailChangeStep('verify');
      setEmailChangeCode('');
      setEmailChangeDestination(result.destination || result.email || normalizedDraft);
      setEmailChangeExpiresAt(result.expiresAt || '');
      showToastNotification('success', 'Verification code sent to your new email address.');
    } catch (err) {
      setEmailChangeError(err instanceof Error ? err.message : 'Failed to start the email change verification.');
    } finally {
      setRequestingEmailChange(false);
    }
  };

  const submitEmailChangeVerification = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const normalizedCode = emailChangeCode.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
    if (!new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(normalizedCode)) {
      setEmailChangeError('Enter the 6-digit verification code sent to your new email.');
      return;
    }

    setConfirmingEmailChange(true);
    setEmailChangeError('');

    try {
      const updatedProfile = await verifyChangedEmailAddress(normalizedCode);
      setProfile(updatedProfile);
      setFormData((prev) => ({
        ...prev,
        username: updatedProfile.username,
        displayName: updatedProfile.displayName,
        email: updatedProfile.email,
        phone: updatedProfile.phone || '',
      }));
      resetEmailChangeModal();
      showToastNotification('success', 'Email address changed and verified successfully.');
      onProfileUpdated?.(updatedProfile);
    } catch (err) {
      setEmailChangeError(err instanceof Error ? err.message : 'Failed to verify the new email address.');
    } finally {
      setConfirmingEmailChange(false);
    }
  };

  const handlePhoneAction = async () => {
    if (!profile) return;

    if (activePhoneIsVerified) {
      setPhoneEditMode(true);
      phoneInputRef.current?.focus();
      phoneInputRef.current?.select();
      return;
    }

    if (!showVerifyButton) {
      showToastNotification('error', 'Enter a complete 11-digit mobile number before verifying.');
      return;
    }

    setSendingPhoneCode(true);
    setStatus(null);

    try {
      const sendResult = await sendPhoneVerificationCode(normalizedPhoneInput);
      setVerificationTarget('phone');
      setVerificationChannel(sendResult.channel || 'sms');
      setVerificationEmailProvider(sendResult.emailProvider || '');
      setVerificationDestination(sendResult.destination || sendResult.phone || normalizedPhoneInput);
      setVerificationDeliveryStatus(sendResult.deliveryStatus || 'accepted');
      setVerificationMessageId(sendResult.messageId || '');
      setVerificationProviderMessage(String(sendResult.providerMessage || '').trim());
      setVerificationFallbackReason(sendResult.fallbackUsed ? String(sendResult.fallbackReason || '').trim() : '');
      setVerificationExpiresAt(sendResult.expiresAt || '');
      setVerificationDigits(Array(VERIFICATION_CODE_LENGTH).fill(''));
      setShowVerificationModal(true);
      if (sendResult.channel === 'email') {
        const providerText = sendResult.emailProvider ? ` via ${sendResult.emailProvider}` : '';
        showToastNotification('success', `SMS failed. Verification code sent to your email${providerText}.`);
      } else {
        showToastNotification('success', 'Verification code sent. Enter the code in the popup.');
      }
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to verify phone number.');
    } finally {
      setSendingPhoneCode(false);
    }
  };

  const closeVerificationModal = () => {
    if (confirmingVerificationCode) return;
    setShowVerificationModal(false);
    setVerificationDigits(Array(VERIFICATION_CODE_LENGTH).fill(''));
    setVerificationExpiresAt('');
    setPendingEmailPrimaryActivation(false);
  };

  const handleVerificationDigitChange = (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digitsOnly = e.target.value.replace(/\D/g, '');
    const nextDigit = digitsOnly ? digitsOnly.slice(-1) : '';

    setVerificationDigits((prev) => {
      const next = [...prev];
      next[index] = nextDigit;
      return next;
    });

    if (nextDigit && index < VERIFICATION_CODE_LENGTH - 1) {
      verificationCodeInputRefs.current[index + 1]?.focus();
      verificationCodeInputRefs.current[index + 1]?.select();
    }
  };

  const handleVerificationDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (verificationDigits[index]) {
        setVerificationDigits((prev) => {
          const next = [...prev];
          next[index] = '';
          return next;
        });
        return;
      }

      if (index > 0) {
        verificationCodeInputRefs.current[index - 1]?.focus();
        setVerificationDigits((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
      }
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      verificationCodeInputRefs.current[index - 1]?.focus();
      return;
    }

    if (e.key === 'ArrowRight' && index < VERIFICATION_CODE_LENGTH - 1) {
      e.preventDefault();
      verificationCodeInputRefs.current[index + 1]?.focus();
      return;
    }

    if (e.key.length === 1 && !/\d/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleVerificationCodePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
    if (!pastedDigits) return;

    e.preventDefault();
    const nextDigits = Array(VERIFICATION_CODE_LENGTH).fill('');
    for (let index = 0; index < pastedDigits.length; index += 1) {
      nextDigits[index] = pastedDigits[index];
    }
    setVerificationDigits(nextDigits);

    const nextFocusIndex = Math.min(pastedDigits.length, VERIFICATION_CODE_LENGTH - 1);
    verificationCodeInputRefs.current[nextFocusIndex]?.focus();
  };

  const handleEmailChangeCodePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
    if (!pastedDigits) return;

    event.preventDefault();
    setEmailChangeCode(pastedDigits);
    if (emailChangeError) {
      setEmailChangeError('');
    }
  };

  const submitVerificationCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const code = verificationDigits.join('');
    if (!new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`).test(code)) {
      showToastNotification('error', 'Please enter a valid 6-digit verification code.');
      return;
    }

    setConfirmingVerificationCode(true);
    setStatus(null);

    try {
      const shouldMakeEmailPrimary = verificationTarget === 'email' && pendingEmailPrimaryActivation;
      const verifiedProfile = verificationTarget === 'email'
        ? await verifyEmailAddress(code)
        : await verifyPhoneNumber(code);

      let nextProfile = verifiedProfile;
      let successMessage = verificationTarget === 'email'
        ? 'Email address verified successfully.'
        : 'Phone number verified successfully.';

      if (shouldMakeEmailPrimary) {
        try {
          nextProfile = await updateProfile({ primaryLoginMethod: 'email' });
          successMessage = 'Email address verified and enabled for Google sign-in.';
        } catch (primaryError) {
          setProfile(verifiedProfile);
          setFormData((prev) => ({
            ...prev,
            username: verifiedProfile.username,
            displayName: verifiedProfile.displayName,
            email: verifiedProfile.email,
            phone: verifiedProfile.phone || '',
          }));
          setPhoneEditMode(false);
          setShowVerificationModal(false);
          setVerificationDigits(Array(VERIFICATION_CODE_LENGTH).fill(''));
          setPendingEmailPrimaryActivation(false);
          onProfileUpdated?.(verifiedProfile);
          showToastNotification(
            'error',
            primaryError instanceof Error
              ? `${primaryError.message} Email was verified, but Google sign-in is still not enabled.`
              : 'Email was verified, but Google sign-in is still not enabled.'
          );
          return;
        }
      }

      setProfile(nextProfile);
      setFormData((prev) => ({
        ...prev,
        username: nextProfile.username,
        displayName: nextProfile.displayName,
        email: nextProfile.email,
        phone: nextProfile.phone || '',
      }));
      setPhoneEditMode(false);
      setShowVerificationModal(false);
      setVerificationDigits(Array(VERIFICATION_CODE_LENGTH).fill(''));
      setVerificationExpiresAt('');
      setPendingEmailPrimaryActivation(false);
      showToastNotification('success', successMessage);
      onProfileUpdated?.(nextProfile);
    } catch (err) {
      setPendingEmailPrimaryActivation(false);
      showToastNotification('error', err instanceof Error ? err.message : (
        verificationTarget === 'email' ? 'Failed to verify email address.' : 'Failed to verify phone number.'
      ));
    } finally {
      setConfirmingVerificationCode(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_AVATAR_SIZE) {
      showToastNotification('error', 'File size must be less than 5MB.');
      return;
    }

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToastNotification('error', 'Only image files (JPEG, JPG, PNG, GIF, WebP) are allowed.');
      return;
    }

    setUploadingAvatar(true);

    try {
      const result = await uploadAvatar(file);
      setAvatarLoadError(false);
      setProfile((prev) => (prev ? { ...prev, avatar: result.avatar } : null));
      showToastNotification('success', 'Avatar uploaded successfully.');
      if (profile) {
        onProfileUpdated?.({ ...profile, avatar: result.avatar });
      }
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to upload avatar.');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile || !isDirty) return;

    setStatus(null);
    setSaving(true);

    try {
      const updates: UpdateProfileRequest = {
        displayName: formData.displayName.trim() || undefined,
        email: formData.email.trim() || undefined,
      };
      updates.phone = formData.phone.trim();

      const updated = await updateProfile(updates);
      setProfile(updated);
      setFormData((prev) => ({ ...prev, displayName: updated.displayName, email: updated.email, phone: updated.phone || '' }));
      setPhoneEditMode(false);
      showToastNotification('success', 'Profile updated successfully.');
      onProfileUpdated?.(updated);
    } catch (err) {
      showToastNotification('error', err instanceof Error ? err.message : 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="profile-page">
        <p className="profile-muted">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <h2 className="profile-title">Profile</h2>
        <p className="profile-desc">Keep your account details accurate and maintain a professional profile image.</p>
      </header>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="profile-layout">
          <section className="profile-panel profile-panel-avatar" aria-label="Avatar and account summary">
            <label className="profile-label profile-avatar-label">Profile Picture</label>

            <button
              type="button"
              onClick={handleAvatarClick}
              className="profile-avatar-button"
              title="Click to change avatar"
              disabled={uploadingAvatar}
            >
              {profile?.avatar && !avatarLoadError ? (
                <img
                  src={profile.avatar.startsWith('data:') ? profile.avatar : `data:image/jpeg;base64,${profile.avatar}`}
                  alt="Profile avatar"
                  className="profile-page-avatar"
                  onError={() => setAvatarLoadError(true)}
                />
              ) : (
                <div className="profile-avatar-placeholder">
                  <span>{formData.displayName?.trim()?.charAt(0)?.toUpperCase() || 'U'}</span>
                </div>
              )}

              <span className="profile-edit-overlay" aria-hidden="true">
                {uploadingAvatar ? 'Uploading...' : <Edit size={22} />}
              </span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              onChange={handleAvatarChange}
              className="profile-file-input"
            />

            <p className="profile-avatar-hint">JPG, PNG, GIF or WebP. Maximum file size: 5MB.</p>

            <div className="profile-account-meta">
              <span className="profile-account-role">{accountTypeLabel}</span>
              {accountIsVerified && <span className="profile-verified-badge profile-verified-badge-account">Verified Account</span>}
              <span className="profile-account-login-mode">Google sign-in: {isEmailPrimaryLogin ? 'Enabled' : 'Not enabled'}</span>
              <span className="profile-account-username">@{formData.username}</span>
            </div>
          </section>

          <section className="profile-panel" aria-label="Account information">
            <div className="form-group">
              <div className="profile-label-row">
                <label className="profile-label" htmlFor="username">Username</label>
                <div className="profile-label-actions">
                  <span className="profile-primary-login-badge">Manual Sign-In</span>
                </div>
              </div>
              <input id="username" type="text" className="profile-input profile-input-readonly" value={formData.username} readOnly tabIndex={-1} />
              <p className="profile-login-hint">{usernameLoginHint}</p>
            </div>

            <div className="form-group">
              <label htmlFor="displayName" className="profile-label">Display Name</label>
              <input
                id="displayName"
                name="displayName"
                type="text"
                className="profile-input"
                value={formData.displayName}
                onChange={handleChange}
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <div className="profile-label-row">
                <label htmlFor="email" className="profile-label">Email Address</label>
                <div className="profile-label-actions">
                  {activeEmailIsVerified && isEmailPrimaryLogin && (
                    <span className="profile-primary-login-badge">Google Sign-In</span>
                  )}
                  {activeEmailIsVerified && <span className="profile-verified-badge">Verified</span>}
                </div>
              </div>
              <div className="profile-input-action-wrap">
                <input
                  id="email"
                  name="email"
                  type="email"
                  className={`profile-input ${showEmailActionButton ? 'profile-input-has-action profile-input-has-wide-action' : ''} ${showChangeEmailButton ? 'profile-input-readonly' : ''}`}
                  value={formData.email}
                  onChange={handleChange}
                  autoComplete="email"
                  readOnly={showChangeEmailButton}
                />
                {showEmailActionButton && (
                  <button
                    type="button"
                    className="profile-input-action-btn profile-input-action-btn-wide"
                    onClick={showChangeEmailButton ? openEmailChangeModal : handleEmailPrimaryAction}
                    disabled={saving || updatingPrimaryLogin || sendingEmailCode || sendingPhoneCode || confirmingVerificationCode || requestingEmailChange || confirmingEmailChange}
                  >
                    {showChangeEmailButton
                      ? 'Change Email'
                      : (updatingPrimaryLogin
                        ? 'Saving...'
                        : (sendingEmailCode ? 'Sending...' : 'Make Primary'))}
                  </button>
                )}
              </div>
              <p className={`profile-verify-hint ${activeEmailIsVerified ? 'verified' : 'unverified'}`}>
                {emailVerificationHint}
              </p>
            </div>

            <div className="form-group">
              <label htmlFor="phone" className="profile-label">Phone Number</label>
              <div className="profile-input-action-wrap">
                <input
                  ref={phoneInputRef}
                  id="phone"
                  name="phone"
                  type="tel"
                  className={`profile-input ${showPhoneActionButton ? 'profile-input-has-action' : ''}`}
                  value={formData.phone}
                  onChange={handleChange}
                  autoComplete="tel"
                  placeholder="09XXXXXXXXX"
                  readOnly={phoneInputLocked}
                />
                {showPhoneActionButton && (
                  <button
                    type="button"
                    className="profile-input-action-btn"
                    onClick={handlePhoneAction}
                    disabled={saving || updatingPrimaryLogin || sendingPhoneCode || sendingEmailCode || confirmingVerificationCode}
                  >
                    {activePhoneIsVerified ? 'Edit' : (sendingPhoneCode ? 'Sending...' : 'Verify')}
                  </button>
                )}
              </div>
              <p className={`profile-verify-hint ${activePhoneIsVerified ? 'verified' : 'unverified'}`}>
                {phoneVerificationHint}
              </p>
            </div>

            <div className="profile-actions">
              <button type="button" className="profile-info-btn" onClick={() => onNavigate?.('personal-details')}>
                <Info size={16} />
                View Personal Details
              </button>

              <button type="submit" className="profile-submit" disabled={saving || updatingPrimaryLogin || !isDirty}>
                {saving ? 'Saving changes...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </div>
      </form>

      {showVerificationModal && (
        <div className="profile-verify-modal-backdrop" role="presentation">
          <div className="profile-verify-modal" role="dialog" aria-modal="true" aria-labelledby="verify-contact-title">
            <h3 id="verify-contact-title" className="profile-verify-modal-title">
              {verificationTarget === 'email' ? 'Verify Email Address' : 'Verify Phone Number'}
            </h3>
            <p className="profile-verify-modal-desc">
              Enter the 6-digit code sent via <strong>{verificationChannel === 'email' ? 'Email' : 'SMS'}</strong>
              {verificationDestination ? <> to <strong>{verificationDestination}</strong></> : null}.
            </p>
            {verificationSecondsRemaining !== null ? (
              <p className={`profile-verify-modal-timer ${verificationSecondsRemaining === 0 ? 'expired' : ''}`}>
                {verificationSecondsRemaining === 0
                  ? 'Code expired. Close this card and request a new one.'
                  : `Code expires in ${formatVerificationCountdown(verificationSecondsRemaining)}`}
              </p>
            ) : null}
            {verificationTarget === 'phone' && verificationChannel === 'email' && verificationEmailProvider ? (
              <p className="profile-verify-modal-provider">
                Email provider: {verificationEmailProvider}
              </p>
            ) : null}
            {verificationTarget === 'phone' ? (
              <p className="profile-verify-modal-meta">
                Status: {verificationDeliveryStatus || 'accepted'}
                {verificationMessageId ? ` | Message ID: ${verificationMessageId}` : ''}
              </p>
            ) : null}
            {verificationTarget === 'phone' && verificationProviderMessage ? (
              <p className="profile-verify-modal-provider">Gateway: {verificationProviderMessage}</p>
            ) : null}
            {verificationTarget === 'phone' && verificationFallbackReason ? (
              <p className="profile-verify-modal-fallback">Fallback reason: {verificationFallbackReason}</p>
            ) : null}

            <form className="profile-verify-modal-form" onSubmit={submitVerificationCode}>
              <div className="profile-verify-otp-group">
                {verificationDigits.map((digit, index) => (
                  <input
                    key={`otp-digit-${index}`}
                    ref={(element) => { verificationCodeInputRefs.current[index] = element; }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    className="profile-verify-otp-input"
                    value={digit}
                    onChange={(e) => handleVerificationDigitChange(index, e)}
                    onKeyDown={(e) => handleVerificationDigitKeyDown(index, e)}
                    onPaste={handleVerificationCodePaste}
                    maxLength={1}
                    aria-label={`Verification code digit ${index + 1}`}
                  />
                ))}
              </div>
              <div className="profile-verify-modal-actions">
                <button
                  type="button"
                  className="profile-verify-cancel-btn"
                  onClick={closeVerificationModal}
                  disabled={confirmingVerificationCode}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="profile-verify-submit-btn"
                  disabled={confirmingVerificationCode}
                >
                  {confirmingVerificationCode ? 'Verifying...' : 'Verify Code'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEmailChangeModal && (
        <div className="profile-email-change-modal-backdrop" role="presentation">
          <div className="profile-email-change-modal" role="dialog" aria-modal="true" aria-labelledby="profile-email-change-title">
            <h3 id="profile-email-change-title" className="profile-email-change-title">Change Google Sign-In Email</h3>
            <p className="profile-email-change-desc">
              Your current Google sign-in email is <strong>{normalizedProfileEmail}</strong>. Verify a new email first before replacing it.
            </p>

            {emailChangeStep === 'email' ? (
              <form className="profile-email-change-form" onSubmit={submitEmailChangeRequest}>
                {emailChangeError && <p className="profile-email-change-error" role="alert">{emailChangeError}</p>}
                <label className="profile-label" htmlFor="profile-email-change-input">New Email Address</label>
                <input
                  id="profile-email-change-input"
                  type="email"
                  className="profile-input"
                  value={emailChangeDraft}
                  onChange={(event) => {
                    setEmailChangeDraft(event.target.value);
                    if (emailChangeError) {
                      setEmailChangeError('');
                    }
                  }}
                  autoComplete="email"
                  placeholder="Enter new email address"
                />
                <p className="profile-email-change-hint">
                  We will send a verification code to the new email. Your current email stays active until the code is confirmed.
                </p>
                <div className="profile-email-change-actions">
                  <button
                    type="button"
                    className="profile-email-change-cancel-btn"
                    onClick={closeEmailChangeModal}
                    disabled={requestingEmailChange}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="profile-email-change-submit-btn"
                    disabled={requestingEmailChange}
                  >
                    {requestingEmailChange ? 'Sending...' : 'Send Verification'}
                  </button>
                </div>
              </form>
            ) : (
              <form className="profile-email-change-form" onSubmit={submitEmailChangeVerification}>
                {emailChangeError && <p className="profile-email-change-error" role="alert">{emailChangeError}</p>}
                <p className="profile-email-change-meta">
                  Code sent to <strong>{emailChangeDestination || emailChangeDraft}</strong>.
                </p>
                {emailChangeSecondsRemaining !== null ? (
                  <p className={`profile-email-change-timer ${emailChangeSecondsRemaining === 0 ? 'expired' : ''}`}>
                    {emailChangeSecondsRemaining === 0
                      ? 'Code expired. Close this card and send a new verification code.'
                      : `Code expires in ${formatVerificationCountdown(emailChangeSecondsRemaining)}`}
                  </p>
                ) : null}
                <label className="profile-label" htmlFor="profile-email-change-code">Verification Code</label>
                <input
                  id="profile-email-change-code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={VERIFICATION_CODE_LENGTH}
                  className="profile-email-change-code-input"
                  value={emailChangeCode}
                  onChange={(event) => {
                    setEmailChangeCode(event.target.value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
                    if (emailChangeError) {
                      setEmailChangeError('');
                    }
                  }}
                  onPaste={handleEmailChangeCodePaste}
                  placeholder="Enter 6-digit code"
                />
                <div className="profile-email-change-actions">
                  <button
                    type="button"
                    className="profile-email-change-cancel-btn"
                    onClick={closeEmailChangeModal}
                    disabled={confirmingEmailChange}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="profile-email-change-submit-btn"
                    disabled={confirmingEmailChange}
                  >
                    {confirmingEmailChange ? 'Verifying...' : 'Verify New Email'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {status && typeof document !== 'undefined'
        ? createPortal(
          <div className={`profile-toast ${status.type} ${showToast ? 'show' : ''}`} role="alert">
            {status.message}
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
