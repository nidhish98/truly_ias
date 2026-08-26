(function () {
  const API = '/api';

  let state = {
    currentScreen: 'login',
    userId: null,
    challengeId: null,
    mfaMethod: null,
    accessToken: null,
    refreshToken: null,
    user: null,
    otpTimer: 60,
    otpTimerInterval: null,
    otpAttemptsLeft: null,
    maskedInfo: '',
  };

  const app = document.getElementById('app');

  // ─── API Helper ──────────────────────────────────────────────
  async function api(path, options = {}) {
    const res = await fetch(API + path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }

  // ─── Render ──────────────────────────────────────────────────
  function render() {
    if (state.currentScreen === 'dashboard') {
      renderDashboard();
      return;
    }
    const screen = screens[state.currentScreen];
    if (!screen) return;
    app.innerHTML = `
      <div class="auth-container">
        <div class="brand-panel">
          <div class="brand-icon">
            <div class="shield-icon"></div>
          </div>
          <div class="brand-title">SecureID</div>
          <div class="brand-subtitle">Enterprise-grade identity & access management solution for modern organizations.</div>
          <div class="brand-features">
            <div class="brand-feature">
              <div class="feature-icon">&#128274;</div>
              <span>Multi-factor authentication</span>
            </div>
            <div class="brand-feature">
              <div class="feature-icon">&#128737;</div>
              <span>End-to-end encryption</span>
            </div>
            <div class="brand-feature">
              <div class="feature-icon">&#9889;</div>
              <span>Real-time threat detection</span>
            </div>
          </div>
        </div>
        <div class="form-panel">
          <div class="form-wrapper">
            <div class="form-card">
              ${screen()}
            </div>
          </div>
        </div>
      </div>
    `;
    if (screen.init) screen.init();
  }

  // ─── Step Indicator ──────────────────────────────────────────
  function renderStepIndicator(currentStep) {
    const steps = [
      { num: 1, label: 'Email' },
      { num: 2, label: 'Phone' },
      { num: 3, label: 'Done' },
    ];
    return `
      <div class="step-indicator">
        ${steps.map(s => `<div class="step-dot ${s.num < currentStep ? 'completed' : ''} ${s.num === currentStep ? 'active' : ''}"></div>`).join('')}
      </div>
    `;
  }

  // ─── Screens ─────────────────────────────────────────────────
  const screens = {
    login: renderLogin,
    register: renderRegister,
    emailOtp: renderEmailOtp,
    smsOtp: renderSmsOtp,
    mfaSelect: renderMfaSelect,
    loginMfaSelect: renderLoginMfaSelect,
    mfaSetup: renderMfaSetup,
    mfaVerify: renderMfaVerify,
    registrationSuccess: renderRegistrationSuccess,
    loginMfaOtp: renderLoginMfaOtp,
  };

  // ─── LOGIN ───────────────────────────────────────────────────
  function renderLogin() {
    return `
      <div class="form-header">
        <h1 class="form-title">Welcome back</h1>
        <p class="form-subtitle">Sign in to your SecureID account to continue</p>
      </div>
      <div id="login-alert"></div>
      <form id="login-form">
        <div class="form-group">
          <label class="form-label">Email or Username</label>
          <div class="input-wrapper has-icon-left">
            <span class="icon-left">&#9993;</span>
            <input type="text" id="login-email" placeholder="Enter your email or username" autocomplete="username">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <div class="input-wrapper has-icon-left has-icon-right">
            <span class="icon-left">&#128272;</span>
            <input type="password" id="login-password" placeholder="Enter your password" autocomplete="current-password">
            <button type="button" class="icon-right" id="toggle-password" aria-label="Toggle password">
              <span id="eye-icon">&#128065;</span>
            </button>
          </div>
        </div>
        <div class="form-row">
          <div class="checkbox-wrapper">
            <input type="checkbox" id="remember-me">
            <label for="remember-me">Remember me</label>
          </div>
          <a href="javascript:void(0)" class="forgot-link" onclick="alert('Password reset functionality coming soon.')">Forgot password?</a>
        </div>
        <button type="submit" class="btn btn-primary" id="login-btn">Sign In</button>
      </form>
      <div class="divider"><span>OR</span></div>
      <button class="btn btn-google" onclick="alert('Google OAuth integration coming soon.')">
        <span class="google-icon">G</span>
        Continue with Google
      </button>
      <div class="form-footer">
        Don't have an account? <a onclick="navigate('register')">Create Account</a>
      </div>
    `;
  }

  function initLogin() {
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('toggle-password').addEventListener('click', () => {
      const input = document.getElementById('login-password');
      const icon = document.getElementById('eye-icon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '&#128064;';
      } else {
        input.type = 'password';
        icon.innerHTML = '&#128065;';
      }
    });
  }

  async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('login-btn');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showAlert('login-alert', 'Please enter both email and password.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Signing in...';

    const { ok, data } = await api('/login', {
      method: 'POST',
      body: { email, password },
    });

    btn.disabled = false;
    btn.innerHTML = 'Sign In';

    if (!ok) {
      if (data.lockedMinutes) {
        showAlert('login-alert', `Account locked. Try again in ${data.lockedMinutes} minutes.`, 'error');
      } else if (data.attemptsLeft !== undefined && data.attemptsLeft <= 2) {
        showAlert('login-alert', `${data.error}. ${data.attemptsLeft} attempt(s) remaining before lockout.`, 'error');
      } else {
        showAlert('login-alert', data.error || 'Login failed', 'error');
      }
      return;
    }

    if (data.mfaRequired) {
      state.userId = data.userId;
      state.mfaMethod = data.method;
      state.challengeId = data.challengeId;
      state.currentScreen = 'loginMfaSelect';
      render();
    } else {
      state.accessToken = data.accessToken;
      state.refreshToken = data.refreshToken;
      state.user = data.user;
      state.currentScreen = 'dashboard';
      render();
    }
  }

  // ─── REGISTER ────────────────────────────────────────────────
  function renderRegister() {
    return `
      <div class="form-header">
        <button class="back-btn" onclick="navigate('login')">&#8592; Back to login</button>
        <h1 class="form-title">Create Account</h1>
        <p class="form-subtitle">Join SecureID to protect your digital identity</p>
      </div>
      <div id="register-alert"></div>
      <form id="register-form">
        <div class="form-group">
          <label class="form-label">Full Name</label>
          <div class="input-wrapper has-icon-left">
            <span class="icon-left">&#128100;</span>
            <input type="text" id="reg-name" placeholder="Enter your full name">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <div class="input-wrapper has-icon-left">
            <span class="icon-left">&#9993;</span>
            <input type="email" id="reg-email" placeholder="Enter your email address">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Phone Number</label>
          <div class="input-wrapper has-icon-left">
            <span class="icon-left">&#128222;</span>
            <input type="tel" id="reg-phone" placeholder="Enter your phone number">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <div class="input-wrapper has-icon-left has-icon-right">
            <span class="icon-left">&#128272;</span>
            <input type="password" id="reg-password" placeholder="Create a password" autocomplete="new-password">
            <button type="button" class="icon-right" id="toggle-reg-password" aria-label="Toggle password">
              <span id="reg-eye-icon">&#128065;</span>
            </button>
          </div>
          <div class="password-requirements" id="password-reqs">
            <h4>Password Requirements</h4>
            <div class="req-item" data-req="length"><span class="req-dot"></span> At least 8 characters</div>
            <div class="req-item" data-req="upper"><span class="req-dot"></span> At least one uppercase letter</div>
            <div class="req-item" data-req="lower"><span class="req-dot"></span> At least one lowercase letter</div>
            <div class="req-item" data-req="number"><span class="req-dot"></span> At least one number</div>
            <div class="req-item" data-req="special"><span class="req-dot"></span> At least one special character</div>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Confirm Password</label>
          <div class="input-wrapper has-icon-left">
            <span class="icon-left">&#128272;</span>
            <input type="password" id="reg-confirm-password" placeholder="Confirm your password" autocomplete="new-password">
          </div>
        </div>
        <div class="terms-wrapper">
          <input type="checkbox" id="terms-check">
          <label for="terms-check">I agree to the <a href="javascript:void(0)">Terms of Service</a> and <a href="javascript:void(0)">Privacy Policy</a></label>
        </div>
        <button type="submit" class="btn btn-primary" id="register-btn">Create Account</button>
      </form>
      <div class="form-footer">
        Already have an account? <a onclick="navigate('login')">Sign In</a>
      </div>
    `;
  }

  function initRegister() {
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    document.getElementById('toggle-reg-password').addEventListener('click', () => {
      const input = document.getElementById('reg-password');
      const icon = document.getElementById('reg-eye-icon');
      if (input.type === 'password') {
        input.type = 'text';
        icon.innerHTML = '&#128064;';
      } else {
        input.type = 'password';
        icon.innerHTML = '&#128065;';
      }
    });
    document.getElementById('reg-password').addEventListener('input', (e) => {
      updatePasswordReqs(e.target.value);
    });
  }

  function updatePasswordReqs(password) {
    const checks = {
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    for (const [key, met] of Object.entries(checks)) {
      const el = document.querySelector(`[data-req="${key}"]`);
      if (el) {
        el.classList.toggle('met', met);
      }
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('register-btn');
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const terms = document.getElementById('terms-check').checked;

    if (!name || !email || !phone || !password || !confirmPassword) {
      showAlert('register-alert', 'All fields are required.', 'error');
      return;
    }
    if (!terms) {
      showAlert('register-alert', 'Please accept the Terms of Service.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showAlert('register-alert', 'Passwords do not match.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creating account...';

    const { ok, data } = await api('/register', {
      method: 'POST',
      body: { name, email, phone, password, confirmPassword },
    });

    btn.disabled = false;
    btn.innerHTML = 'Create Account';

    if (!ok) {
      showAlert('register-alert', data.error || 'Registration failed', 'error');
      return;
    }

    state.userId = data.userId;
    state.maskedInfo = data.email;
    state.currentScreen = 'emailOtp';
    render();
    startOtpTimer();
  }

  // ─── EMAIL OTP ───────────────────────────────────────────────
  function renderEmailOtp() {
    return `
      <div class="otp-container">
        ${renderStepIndicator(1)}
        <div class="otp-icon">&#9993;</div>
        <h1 class="form-title">Verify Your Email</h1>
        <p class="form-subtitle">We've sent a 6-digit verification code to</p>
        <div class="masked-info">${state.maskedInfo || 'your email'}</div>
        <div id="otp-alert"></div>
        <div class="otp-boxes" id="otp-boxes">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
        </div>
        <div class="otp-timer" id="otp-timer"></div>
        <div class="otp-resend" id="otp-resend"></div>
        <div style="margin-top: 20px;">
          <button class="btn btn-primary" id="verify-otp-btn">Verify Email</button>
        </div>
        <div style="margin-top: 16px;">
          <button class="back-btn" style="margin:0" onclick="navigate('register')">&#8592; Change email</button>
        </div>
      </div>
    `;
  }

  // ─── SMS OTP ─────────────────────────────────────────────────
  function renderSmsOtp() {
    return `
      <div class="otp-container">
        ${renderStepIndicator(2)}
        <div class="otp-icon">&#128222;</div>
        <h1 class="form-title">Verify Your Phone</h1>
        <p class="form-subtitle">We've sent a 6-digit verification code via SMS to</p>
        <div class="masked-info">${state.maskedInfo || 'your phone'}</div>
        <div id="otp-alert"></div>
        <div class="otp-boxes" id="otp-boxes">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
        </div>
        <div class="otp-timer" id="otp-timer"></div>
        <div class="otp-resend" id="otp-resend"></div>
        <div style="margin-top: 20px;">
          <button class="btn btn-primary" id="verify-otp-btn">Verify Phone</button>
        </div>
      </div>
    `;
  }

  // ─── LOGIN MFA SELECT ───────────────────────────────────────
  function renderLoginMfaSelect() {
    return `
      <div class="form-header">
        <button class="back-btn" onclick="navigate('login')">&#8592; Back to login</button>
        <h1 class="form-title">Choose MFA Method</h1>
        <p class="form-subtitle">Select how you'd like to receive your verification code</p>
      </div>
      <div class="mfa-methods">
        <div class="mfa-card" onclick="selectLoginMfaMethod('email')">
          <div class="mfa-card-icon">&#9993;</div>
          <div class="mfa-card-info">
            <h3>Email</h3>
            <p>Receive code via email address</p>
          </div>
        </div>
        <div class="mfa-card" onclick="selectLoginMfaMethod('sms')">
          <div class="mfa-card-icon">&#128222;</div>
          <div class="mfa-card-info">
            <h3>SMS</h3>
            <p>Receive code via text message</p>
          </div>
        </div>
        <div class="mfa-card" onclick="selectLoginMfaMethod('authenticator')">
          <div class="mfa-card-icon">&#128241;</div>
          <div class="mfa-card-info">
            <h3>Authenticator App</h3>
            <p>Use Google Authenticator or similar</p>
          </div>
        </div>
      </div>
    `;
  }

  window.selectLoginMfaMethod = async function(method) {
    if (method === 'authenticator') {
      state.mfaMethod = 'authenticator';
      state.currentScreen = 'mfaVerify';
      render();
      return;
    }

    const { ok, data } = await api(`/${method === 'email' ? 'send-email-otp' : 'send-sms-otp'}`, {
      method: 'POST',
      body: { userId: state.userId, purpose: 'login_mfa' },
    });
    if (ok) {
      state.challengeId = data.challengeId;
      state.mfaMethod = method;
      state.maskedInfo = data.maskedEmail || data.maskedPhone;
      state.currentScreen = 'loginMfaOtp';
      render();
      startOtpTimer();
    }
  };

  // ─── LOGIN MFA OTP ───────────────────────────────────────────
  function renderLoginMfaOtp() {
    const methodLabel = state.mfaMethod === 'email' ? 'Email' : 'SMS';
    const icon = state.mfaMethod === 'email' ? '&#9993;' : '&#128222;';
    const desc = state.mfaMethod === 'email'
      ? `We've sent a 6-digit verification code to`
      : `We've sent a 6-digit verification code via SMS to`;
    return `
      <div class="otp-container">
        <div class="otp-icon">${icon}</div>
        <h1 class="form-title">Verify Your ${methodLabel}</h1>
        <p class="form-subtitle">${desc}</p>
        ${state.maskedInfo ? `<div class="masked-info">${state.maskedInfo}</div>` : ''}
        <div id="otp-alert"></div>
        <div class="otp-boxes" id="otp-boxes">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]" autocomplete="one-time-code">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
          <input type="text" class="otp-box" maxlength="1" inputmode="numeric" pattern="[0-9]">
        </div>
        <div class="otp-timer" id="otp-timer"></div>
        <div class="otp-resend" id="otp-resend"></div>
        <div style="margin-top: 20px;">
          <button class="btn btn-primary" id="verify-otp-btn">Verify</button>
        </div>
        <div style="margin-top: 16px;">
          <button class="back-btn" style="margin:0" onclick="navigate('login')">&#8592; Back to login</button>
        </div>
      </div>
    `;
  }

  // ─── OTP Init (shared for all OTP screens) ───────────────────
  function initOtp(type) {
    const boxes = document.querySelectorAll('.otp-box');
    setupOtpBoxes(boxes);

    document.getElementById('verify-otp-btn').addEventListener('click', () => {
      handleVerifyOtp(type);
    });
  }

  function setupOtpBoxes(boxes) {
    boxes.forEach((box, i) => {
      box.addEventListener('input', (e) => {
        const val = e.target.value.replace(/[^0-9]/g, '');
        e.target.value = val;
        if (val && i < boxes.length - 1) {
          boxes[i + 1].focus();
        }
        if (val) {
          box.classList.add('filled');
        } else {
          box.classList.remove('filled');
        }
      });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0) {
          boxes[i - 1].focus();
          boxes[i - 1].value = '';
          boxes[i - 1].classList.remove('filled');
        }
      });
      box.addEventListener('paste', (e) => {
        e.preventDefault();
        const paste = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '');
        for (let j = 0; j < Math.min(paste.length, boxes.length - i); j++) {
          boxes[i + j].value = paste[j];
          boxes[i + j].classList.add('filled');
        }
        const nextIndex = Math.min(i + paste.length, boxes.length - 1);
        boxes[nextIndex].focus();
      });
      box.addEventListener('focus', () => box.select());
    });
  }

  function getOtpValue() {
    const boxes = document.querySelectorAll('.otp-box');
    return Array.from(boxes).map((b) => b.value).join('');
  }

  function clearOtpBoxes() {
    document.querySelectorAll('.otp-box').forEach((b) => {
      b.value = '';
      b.classList.remove('filled', 'error');
    });
    document.querySelector('.otp-box')?.focus();
  }

  function showOtpError(msg) {
    document.querySelectorAll('.otp-box').forEach((b) => b.classList.add('error'));
    showAlert('otp-alert', msg, 'error');
  }

  async function handleVerifyOtp(type) {
    const otp = getOtpValue();
    if (otp.length !== 6) {
      showOtpError('Please enter the complete 6-digit code.');
      return;
    }

    const btn = document.getElementById('verify-otp-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifying...';

    let endpoint, nextScreen;
    if (type === 'email') {
      endpoint = '/verify-email-otp';
      nextScreen = 'smsOtp';
    } else if (type === 'sms') {
      endpoint = '/verify-sms-otp';
      nextScreen = 'registrationSuccess';
    } else if (type === 'loginMfa') {
      endpoint = '/verify-login-otp';
      nextScreen = 'dashboard';
    }

    const { ok, data } = await api(endpoint, {
      method: 'POST',
      body: { challengeId: state.challengeId, otp },
    });

    btn.disabled = false;
    btn.innerHTML = type === 'loginMfa' ? 'Verify' : type === 'email' ? 'Verify Email' : 'Verify Phone';

    if (!ok) {
      if (data.reason === 'expired' || data.error === 'expired') {
        showOtpError('This OTP has expired. Please request a new one.');
      } else if (data.reason === 'max_attempts' || data.error === 'max_attempts') {
        showOtpError('Maximum verification attempts exceeded. Please start over.');
        setTimeout(() => {
          if (type === 'loginMfa') navigate('login');
          else navigate('register');
        }, 2000);
      } else if (data.reason === 'wrong' || data.error === 'wrong') {
        const left = data.attemptsLeft;
        showOtpError(`Invalid OTP. ${left !== undefined ? left + ' attempt(s) remaining.' : ''}`);
        clearOtpBoxes();
      } else {
        showOtpError(data.error || 'Verification failed');
        clearOtpBoxes();
      }
      return;
    }

    if (type === 'loginMfa') {
      state.accessToken = data.accessToken;
      state.refreshToken = data.refreshToken;
      state.user = data.user;
      state.currentScreen = 'dashboard';
      render();
    } else if (type === 'email') {
      sendSmsOtp();
    } else if (type === 'sms') {
      state.currentScreen = 'registrationSuccess';
      render();
    }
  }

  async function sendSmsOtp() {
    const { ok, data } = await api('/send-sms-otp', {
      method: 'POST',
      body: { userId: state.userId, purpose: 'registration_sms' },
    });
    if (ok) {
      state.challengeId = data.challengeId;
      state.maskedInfo = data.maskedPhone;
      state.currentScreen = 'smsOtp';
      render();
      startOtpTimer();
    }
  }

  // ─── OTP Timer ───────────────────────────────────────────────
  function startOtpTimer() {
    clearInterval(state.otpTimerInterval);
    state.otpTimer = 60;
    updateTimerDisplay();
    state.otpTimerInterval = setInterval(() => {
      state.otpTimer--;
      if (state.otpTimer <= 0) {
        clearInterval(state.otpTimerInterval);
      }
      updateTimerDisplay();
    }, 1000);
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('otp-timer');
    const resendEl = document.getElementById('otp-resend');
    if (!timerEl || !resendEl) return;

    if (state.otpTimer > 0) {
      timerEl.innerHTML = `Code expires in <span>${formatTime(state.otpTimer)}</span>`;
      resendEl.innerHTML = `Didn't receive the code? <a class="disabled">Resend</a>`;
    } else {
      timerEl.innerHTML = 'Code has expired';
      resendEl.innerHTML = `Didn't receive the code? <a onclick="resendOtp()">Resend Code</a>`;
    }
  }

  function formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Resend OTP ──────────────────────────────────────────────
  window.resendOtp = async function () {
    clearOtpBoxes();
    const alertEl = document.getElementById('otp-alert');
    if (alertEl) alertEl.innerHTML = '';

    if (state.currentScreen === 'emailOtp') {
      const { ok, data } = await api('/send-email-otp', {
        method: 'POST',
        body: { userId: state.userId, purpose: 'registration_email' },
      });
      if (ok) {
        state.challengeId = data.challengeId;
        showAlert('otp-alert', 'New OTP sent to your email.', 'success');
        startOtpTimer();
      }
    } else if (state.currentScreen === 'smsOtp') {
      const { ok, data } = await api('/send-sms-otp', {
        method: 'POST',
        body: { userId: state.userId, purpose: 'registration_sms' },
      });
      if (ok) {
        state.challengeId = data.challengeId;
        showAlert('otp-alert', 'New OTP sent via SMS.', 'success');
        startOtpTimer();
      }
    } else if (state.currentScreen === 'loginMfaOtp') {
      const { ok, data } = await api(`/${state.mfaMethod === 'email' ? 'send-email-otp' : 'send-sms-otp'}`, {
        method: 'POST',
        body: { userId: state.userId, purpose: 'login_mfa' },
      });
      if (ok) {
        state.challengeId = data.challengeId;
        showAlert('otp-alert', `New OTP sent via ${state.mfaMethod}.`, 'success');
        startOtpTimer();
      }
    }
  };

  // ─── MFA SELECT ──────────────────────────────────────────────
  function renderMfaSelect() {
    return `
      <div class="form-header">
        <button class="back-btn" onclick="navigate('login')">&#8592; Back to login</button>
        <h1 class="form-title">Choose MFA Method</h1>
        <p class="form-subtitle">Select how you'd like to receive your authentication codes</p>
      </div>
      <div class="mfa-methods">
        <div class="mfa-card" data-method="email" onclick="selectMfaMethod('email')">
          <div class="mfa-card-icon">&#9993;</div>
          <div class="mfa-card-info">
            <h3>Email</h3>
            <p>Receive codes via email address</p>
          </div>
        </div>
        <div class="mfa-card" data-method="sms" onclick="selectMfaMethod('sms')">
          <div class="mfa-card-icon">&#128222;</div>
          <div class="mfa-card-info">
            <h3>SMS</h3>
            <p>Receive codes via text message</p>
          </div>
        </div>
        <div class="mfa-card" data-method="authenticator" onclick="selectMfaMethod('authenticator')">
          <div class="mfa-card-icon">&#128241;</div>
          <div class="mfa-card-info">
            <h3>Authenticator App</h3>
            <p>Use Google Authenticator or similar</p>
          </div>
        </div>
      </div>
      <div style="margin-top: 16px; text-align: center;">
        <button class="btn btn-outline" onclick="skipMfa()">Skip for now</button>
      </div>
    `;
  }

  window.selectMfaMethod = async function (method) {
    state.mfaMethod = method;

    if (method === 'email' || method === 'sms') {
      const { ok, data } = await api(`/${method === 'email' ? 'send-email-otp' : 'send-sms-otp'}`, {
        method: 'POST',
        body: { userId: state.userId, purpose: 'mfa_setup' },
      });
      if (ok) {
        state.challengeId = data.challengeId;
        state.maskedInfo = data.maskedEmail || data.maskedPhone;
        state.currentScreen = method === 'email' ? 'emailOtp' : 'smsOtp';
        render();
        startOtpTimer();
      }
    } else {
      const { ok, data } = await api('/mfa/setup', {
        method: 'POST',
        body: { userId: state.userId, method: 'authenticator' },
      });
      if (ok) {
        state.mfaSetupData = data;
        state.currentScreen = 'mfaSetup';
        render();
      }
    }
  };

  window.skipMfa = function () {
    state.currentScreen = 'registrationSuccess';
    render();
  };

  // ─── MFA SETUP (Authenticator) ───────────────────────────────
  function renderMfaSetup() {
    const data = state.mfaSetupData || {};
    return `
      <div class="form-header">
        <button class="back-btn" onclick="navigate('mfaSelect')">&#8592; Back</button>
        <h1 class="form-title">Authenticator Setup</h1>
        <p class="form-subtitle">Scan the QR code with your authenticator app</p>
      </div>
      <div class="qr-container">
        ${data.qrCode
          ? `<div class="qr-code"><img src="${data.qrCode}" alt="QR Code"></div>`
          : `<div class="qr-code" style="display:flex;align-items:center;justify-content:center;background:#f3f4f6;font-size:13px;color:#6b7280;">QR Code</div>`
        }
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:8px;">Or manually enter this key:</p>
        <div class="secret-key">
          ${data.secret || 'XXXXXXXXXXXX'}
          <button class="copy-btn" onclick="copySecret()">Copy</button>
        </div>
      </div>
      <div id="mfa-setup-alert"></div>
      <div class="form-group">
        <label class="form-label">Enter code from app</label>
        <div class="input-wrapper">
          <input type="text" id="mfa-token" placeholder="Enter 6-digit code" maxlength="6" inputmode="numeric" autocomplete="one-time-code">
        </div>
      </div>
      <button class="btn btn-primary" id="mfa-verify-btn">Verify & Enable</button>
    `;
  }

  function initMfaSetup() {
    document.getElementById('mfa-verify-btn').addEventListener('click', handleMfaVerify);
  }

  window.copySecret = function () {
    const secret = state.mfaSetupData?.secret;
    if (secret) {
      navigator.clipboard?.writeText(secret).then(() => {
        showAlert('mfa-setup-alert', 'Secret copied to clipboard!', 'success');
      }).catch(() => {});
    }
  };

  async function handleMfaVerify() {
    const token = document.getElementById('mfa-token').value.trim();
    if (!token || token.length !== 6) {
      showAlert('mfa-setup-alert', 'Please enter a valid 6-digit code.', 'error');
      return;
    }

    const btn = document.getElementById('mfa-verify-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifying...';

    const { ok, data } = await api('/mfa/verify', {
      method: 'POST',
      body: { userId: state.userId, token },
    });

    btn.disabled = false;
    btn.innerHTML = 'Verify & Enable';

    if (!ok) {
      showAlert('mfa-setup-alert', data.error || 'Verification failed', 'error');
      return;
    }

    showAlert('mfa-setup-alert', 'MFA enabled successfully!', 'success');
    setTimeout(() => {
      state.currentScreen = 'registrationSuccess';
      render();
    }, 1000);
  }

  // ─── MFA VERIFY (during login) ───────────────────────────────
  function renderMfaVerify() {
    return `
      <div class="form-header">
        <button class="back-btn" onclick="navigate('login')">&#8592; Back to login</button>
        <h1 class="form-title">Authenticator Verification</h1>
        <p class="form-subtitle">Enter the 6-digit code from your authenticator app</p>
      </div>
      <div id="mfa-verify-alert"></div>
      <div class="form-group">
        <div class="input-wrapper">
          <input type="text" id="mfa-login-token" placeholder="Enter 6-digit code" maxlength="6" inputmode="numeric" style="text-align:center;font-size:22px;font-weight:700;letter-spacing:8px;" autocomplete="one-time-code">
        </div>
      </div>
      <button class="btn btn-primary" id="mfa-login-verify-btn">Verify</button>
    `;
  }

  function initMfaVerify() {
    document.getElementById('mfa-login-verify-btn').addEventListener('click', handleMfaLoginVerify);
  }

  async function handleMfaLoginVerify() {
    const token = document.getElementById('mfa-login-token').value.trim();
    if (!token || token.length !== 6) {
      showAlert('mfa-verify-alert', 'Please enter a valid 6-digit code.', 'error');
      return;
    }

    const btn = document.getElementById('mfa-login-verify-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Verifying...';

    const { ok, data } = await api('/verify-login-otp', {
      method: 'POST',
      body: { challengeId: state.challengeId, otp: token },
    });

    btn.disabled = false;
    btn.innerHTML = 'Verify';

    if (!ok) {
      showAlert('mfa-verify-alert', data.error || 'Invalid code', 'error');
      return;
    }

    state.accessToken = data.accessToken;
    state.refreshToken = data.refreshToken;
    state.user = data.user;
    state.currentScreen = 'dashboard';
    render();
  }

  // ─── REGISTRATION SUCCESS ────────────────────────────────────
  function renderRegistrationSuccess() {
    return `
      <div class="success-container">
        ${renderStepIndicator(3)}
        <div class="success-icon">&#10003;</div>
        <h1 class="success-title">Registration Complete!</h1>
        <p class="success-message">Your SecureID account has been successfully created, verified, and MFA has been enabled.<br>You can now sign in with your credentials.</p>
        <button class="btn btn-primary" onclick="navigate('login')">Continue to Login</button>
      </div>
    `;
  }

  // ─── DASHBOARD ───────────────────────────────────────────────
  function renderDashboard() {
    const u = state.user || {};
    app.innerHTML = `
      <div class="dashboard">
        <nav class="dashboard-nav">
          <div class="dashboard-brand">SecureID</div>
          <div class="dashboard-user">
            <span class="dashboard-user-name">${u.name || u.email || 'User'}</span>
            <button class="btn btn-outline" style="width:auto;padding:8px 16px;" onclick="handleLogout()">Sign Out</button>
          </div>
        </nav>
        <div class="dashboard-content">
          <div class="dashboard-card">
            <h2>Welcome, ${u.name || 'User'}</h2>
            <p>You are now signed in to your SecureID account.</p>
            <div class="user-info-grid">
              <div class="user-info-item">
                <label>Name</label>
                <span>${u.name || 'N/A'}</span>
              </div>
              <div class="user-info-item">
                <label>Email</label>
                <span>${u.email || 'N/A'}</span>
              </div>
              <div class="user-info-item">
                <label>MFA Status</label>
                <span>${u.mfaEnabled ? 'Enabled (' + (u.mfaMethod || 'N/A') + ')' : 'Disabled'}</span>
              </div>
              <div class="user-info-item">
                <label>Email Verified</label>
                <span>${u.emailVerified ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  window.handleLogout = async function () {
    await api('/logout', { method: 'POST' });
    state = {
      currentScreen: 'login',
      userId: null,
      challengeId: null,
      mfaMethod: null,
      accessToken: null,
      refreshToken: null,
      user: null,
      otpTimer: 60,
      otpTimerInterval: null,
      otpAttemptsLeft: null,
      maskedInfo: '',
    };
    render();
  };

  // ─── Navigation ──────────────────────────────────────────────
  window.navigate = function (screen) {
    clearInterval(state.otpTimerInterval);
    state.currentScreen = screen;
    render();
  };

  // ─── Helpers ─────────────────────────────────────────────────
  function showAlert(elId, msg, type) {
    const el = document.getElementById(elId);
    if (!el) return;
    const icon = type === 'error' ? '&#9888;' : '&#10003;';
    el.innerHTML = `<div class="alert alert-${type}"><span class="alert-icon">${icon}</span>${msg}</div>`;
  }

  // ─── Init screen functions ───────────────────────────────────
  const initMap = {
    login: initLogin,
    register: initRegister,
    emailOtp: () => initOtp('email'),
    smsOtp: () => initOtp('sms'),
    loginMfaOtp: () => initOtp('loginMfa'),
    mfaSetup: initMfaSetup,
    mfaVerify: initMfaVerify,
  };

  const origRender = render;
  render = function () {
    origRender();
    const initFn = initMap[state.currentScreen];
    if (initFn) initFn();
  };

  // ─── Start ───────────────────────────────────────────────────
  render();
})();
