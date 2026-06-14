/**
 * TacTeQ お問い合わせ — 6-step LIFF wizard
 * ?page=tacteq-inquiry&id={FORM_ID}
 */

import {
  TOTAL_STEPS,
  CONSULTATION_TYPES,
  CUSTOMER_TYPES,
  HOUSING_TYPES,
  DAMAGE_CAUSES,
  UNDER_CONSTRUCTION_OPTIONS,
  DEADLINE_OPTIONS,
  REQUEST_PREFERENCES,
  CONTACT_METHODS,
  FIRE_INSURANCE_OPTIONS,
  FIRST_TIME_OPTIONS,
  areasForConsultation,
  needsAreaDetail,
  needsPhone,
  needsEmail,
  lookupJapaneseAddress,
  formatTargetAreasForSubmission,
} from './tacteq-inquiry-fields.js';

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string }>;
  getIDToken(): string | null;
  isInClient(): boolean;
  closeWindow(): void;
};

interface WizardState {
  step: number;
  consultationType: string;
  targetAreas: string[];
  targetAreaDetail: string;
  customerType: string;
  housingType: string;
  damageCause: string;
  underConstruction: string;
  customerName: string;
  furigana: string;
  postalCode: string;
  address: string;
  city: string;
  primaryPurpose: string;
  deadlinePreference: string;
  specificDeadlineDate: string;
  workScheduleNotes: string;
  requestPreference: string;
  firstTimeRepair: string;
  noticedSince: string;
  contactMethods: string[];
  phone: string;
  email: string;
  fireInsurance: string;
  privacyConsent: boolean;
  lineUserId: string;
  displayName: string;
  formId: string;
}

const state: WizardState = {
  step: 1,
  consultationType: '',
  targetAreas: [],
  targetAreaDetail: '',
  customerType: '',
  housingType: '',
  damageCause: '',
  underConstruction: '',
  customerName: '',
  furigana: '',
  postalCode: '',
  address: '',
  city: '',
  primaryPurpose: '',
  deadlinePreference: '',
  specificDeadlineDate: '',
  workScheduleNotes: '',
  requestPreference: '',
  firstTimeRepair: '',
  noticedSince: '',
  contactMethods: [],
  phone: '',
  email: '',
  fireInsurance: '',
  privacyConsent: false,
  lineUserId: '',
  displayName: '',
  formId: '',
};

function getApp(): HTMLElement {
  return document.getElementById('app')!;
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function injectStyles(): void {
  if (document.getElementById('tacteq-inquiry-styles')) return;
  const style = document.createElement('style');
  style.id = 'tacteq-inquiry-styles';
  style.textContent = `
    .tq-page { max-width: 480px; margin: 0 auto; padding: 16px 16px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif; }
    .tq-header { text-align: center; margin-bottom: 16px; }
    .tq-header h1 { font-size: 20px; color: #222; margin: 0 0 8px; }
    .tq-steps { display: flex; gap: 6px; justify-content: center; margin-bottom: 12px; flex-wrap: wrap; }
    .tq-step-dot { width: 8px; height: 8px; border-radius: 50%; background: #ddd; }
    .tq-step-dot.active { background: #06C755; }
    .tq-card { background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .tq-label { display: block; font-size: 14px; font-weight: 600; color: #333; margin-bottom: 10px; }
    .tq-hint { font-size: 12px; color: #888; margin: -6px 0 10px; line-height: 1.5; }
    .tq-required { color: #e53e3e; }
    .tq-options { display: flex; flex-direction: column; gap: 10px; }
    .tq-option {
      display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px;
      border: 1.5px solid #e0e0e0; border-radius: 10px; background: #fafafa;
      font-size: 15px; cursor: pointer; line-height: 1.4;
    }
    .tq-option.selected { border-color: #06C755; background: #e8faf0; }
    .tq-option input { accent-color: #06C755; width: 18px; height: 18px; margin-top: 2px; flex-shrink: 0; }
    .tq-input, .tq-textarea {
      width: 100%; padding: 12px; border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 16px; box-sizing: border-box; background: #fafafa;
    }
    .tq-input:focus, .tq-textarea:focus { outline: none; border-color: #06C755; background: #fff; }
    .tq-input[readonly] { background: #f0f0f0; color: #555; }
    .tq-textarea { min-height: 72px; resize: vertical; }
    .tq-field { margin-bottom: 18px; }
    .tq-row { display: flex; gap: 10px; }
    .tq-row .tq-field { flex: 1; }
    .tq-actions { display: flex; gap: 10px; margin-top: 20px; }
    .tq-btn {
      flex: 1; padding: 14px; border: none; border-radius: 10px; font-size: 16px;
      font-weight: 700; cursor: pointer;
    }
    .tq-btn-primary { background: #FF8C00; color: #fff; }
    .tq-btn-secondary { background: #f0f0f0; color: #333; }
    .tq-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .tq-error { color: #e53e3e; font-size: 13px; margin-top: 8px; }
    .tq-privacy { font-size: 12px; color: #666; line-height: 1.6; margin-bottom: 10px; }
    .tq-success { text-align: center; padding: 32px 16px; }
    .tq-success h2 { color: #06C755; margin-bottom: 12px; }
    .tq-success p { color: #555; line-height: 1.6; font-size: 15px; }
  `;
  document.head.appendChild(style);
}

function stepDots(): string {
  return Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1)
    .map((n) => `<span class="tq-step-dot${state.step === n ? ' active' : ''}"></span>`)
    .join('');
}

function renderRadioOptions(name: string, options: readonly string[] | string[], selected: string): string {
  return options
    .map(
      (opt) => `
      <label class="tq-option${selected === opt ? ' selected' : ''}">
        <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(opt)}"${selected === opt ? ' checked' : ''} />
        <span>${escapeHtml(opt)}</span>
      </label>`,
    )
    .join('');
}

function renderCheckboxOptions(name: string, options: string[], selected: string[]): string {
  return options
    .map(
      (opt) => `
      <label class="tq-option${selected.includes(opt) ? ' selected' : ''}">
        <input type="checkbox" name="${escapeHtml(name)}" value="${escapeHtml(opt)}"${selected.includes(opt) ? ' checked' : ''} />
        <span>${escapeHtml(opt)}</span>
      </label>`,
    )
    .join('');
}

function showError(message: string): void {
  const err = document.getElementById('step-error');
  if (err) {
    err.textContent = message;
    err.hidden = false;
  }
}

function clearError(): void {
  const err = document.getElementById('step-error');
  if (err) err.hidden = true;
}

function bindBack(targetStep: number): void {
  document.getElementById('back-btn')?.addEventListener('click', () => {
    state.step = targetStep;
    render();
  });
}

function bindNext(validate: () => boolean, nextStep: number): void {
  document.getElementById('next-btn')?.addEventListener('click', () => {
    if (!validate()) return;
    state.step = nextStep;
    render();
  });
}

function renderShell(title: string, subtitle: string, body: string, actions: string): string {
  return `
    <div class="tq-page">
      <div class="tq-header">
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p style="font-size:13px;color:#888;margin:0 0 8px;">${escapeHtml(subtitle)}</p>` : ''}
        <div class="tq-steps">${stepDots()}</div>
      </div>
      <div class="tq-card">
        ${body}
        <p class="tq-error" id="step-error" hidden></p>
        <div class="tq-actions">${actions}</div>
      </div>
    </div>`;
}

function render(): void {
  injectStyles();
  const app = getApp();

  if (state.step === 1) {
    app.innerHTML = renderShell(
      'お問い合わせ',
      '',
      `<p class="tq-label">今回のご相談 <span class="tq-required">*</span></p>
       <div class="tq-options">${renderRadioOptions('consultation', CONSULTATION_TYPES, state.consultationType)}</div>`,
      `<button type="button" class="tq-btn tq-btn-primary" id="next-btn">次へ</button>`,
    );
    bindNext(() => {
      const selected = document.querySelector<HTMLInputElement>('input[name="consultation"]:checked');
      if (!selected) {
        showError('ご相談内容を選択してください');
        return false;
      }
      state.consultationType = selected.value;
      const validAreas = areasForConsultation(state.consultationType);
      state.targetAreas = state.targetAreas.filter((a) => validAreas.includes(a));
      clearError();
      return true;
    }, 2);
    return;
  }

  if (state.step === 2) {
    const areas = areasForConsultation(state.consultationType);
    app.innerHTML = renderShell(
      '対象箇所',
      state.consultationType,
      `<p class="tq-label">対象箇所 <span class="tq-required">*</span></p>
       <p class="tq-hint">複数選択できます</p>
       <div class="tq-options">${renderCheckboxOptions('target_areas', areas, state.targetAreas)}</div>
       <div class="tq-field" id="detail-field" style="margin-top:16px;${needsAreaDetail(state.targetAreas) ? '' : 'display:none'}">
         <label class="tq-label" for="area-detail">詳細（自由入力） <span class="tq-required">*</span></label>
         <input class="tq-input" id="area-detail" type="text" value="${escapeHtml(state.targetAreaDetail)}" placeholder="例：キッチンカウンター脇の床" />
       </div>`,
      `<button type="button" class="tq-btn tq-btn-secondary" id="back-btn">戻る</button>
       <button type="button" class="tq-btn tq-btn-primary" id="next-btn">次へ</button>`,
    );
    document.querySelectorAll('input[name="target_areas"]').forEach((el) => {
      el.addEventListener('change', () => {
        state.targetAreas = [...document.querySelectorAll<HTMLInputElement>('input[name="target_areas"]:checked')].map(
          (x) => x.value,
        );
        const detailField = document.getElementById('detail-field');
        if (detailField) detailField.style.display = needsAreaDetail(state.targetAreas) ? '' : 'none';
      });
    });
    bindBack(1);
    bindNext(() => {
      const checked = [...document.querySelectorAll<HTMLInputElement>('input[name="target_areas"]:checked')];
      if (checked.length === 0) {
        showError('対象箇所を1つ以上選択してください');
        return false;
      }
      state.targetAreas = checked.map((x) => x.value);
      state.targetAreaDetail = (document.getElementById('area-detail') as HTMLInputElement | null)?.value.trim() ?? '';
      if (needsAreaDetail(state.targetAreas) && !state.targetAreaDetail) {
        showError('詳細を入力してください');
        return false;
      }
      clearError();
      return true;
    }, 3);
    return;
  }

  if (state.step === 3) {
    app.innerHTML = renderShell(
      'お客様・物件',
      '',
      `<div class="tq-field">
         <p class="tq-label">お客様区分 <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('customer_type', CUSTOMER_TYPES, state.customerType)}</div>
       </div>
       <div class="tq-field">
         <p class="tq-label">お住まいの種類 <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('housing_type', HOUSING_TYPES, state.housingType)}</div>
       </div>
       <div class="tq-field">
         <p class="tq-label">原因は？ <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('damage_cause', DAMAGE_CAUSES, state.damageCause)}</div>
       </div>
       <div class="tq-field">
         <p class="tq-label">工事中の物件ですか？ <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('under_construction', UNDER_CONSTRUCTION_OPTIONS, state.underConstruction)}</div>
       </div>`,
      `<button type="button" class="tq-btn tq-btn-secondary" id="back-btn">戻る</button>
       <button type="button" class="tq-btn tq-btn-primary" id="next-btn">次へ</button>`,
    );
    bindBack(2);
    bindNext(() => {
      const customer = document.querySelector<HTMLInputElement>('input[name="customer_type"]:checked');
      const housing = document.querySelector<HTMLInputElement>('input[name="housing_type"]:checked');
      const damageCause = document.querySelector<HTMLInputElement>('input[name="damage_cause"]:checked');
      const construction = document.querySelector<HTMLInputElement>('input[name="under_construction"]:checked');
      if (!customer || !housing || !damageCause || !construction) {
        showError('必須項目を選択してください');
        return false;
      }
      state.customerType = customer.value;
      state.housingType = housing.value;
      state.damageCause = damageCause.value;
      state.underConstruction = construction.value;
      clearError();
      return true;
    }, 4);
    return;
  }

  if (state.step === 4) {
    app.innerHTML = renderShell(
      '基本情報',
      '',
      `<div class="tq-field">
         <label class="tq-label" for="customer-name">お名前 <span class="tq-required">*</span></label>
         <input class="tq-input" id="customer-name" type="text" value="${escapeHtml(state.customerName)}" placeholder="例：山田 太郎" />
       </div>
       <div class="tq-field">
         <label class="tq-label" for="furigana">フリガナ <span class="tq-required">*</span></label>
         <input class="tq-input" id="furigana" type="text" value="${escapeHtml(state.furigana)}" placeholder="例：ヤマダ タロウ" />
       </div>
       <div class="tq-field">
         <label class="tq-label" for="postal-code">郵便番号</label>
         <p class="tq-hint">入力すると住所が自動入力されます（任意）</p>
         <input class="tq-input" id="postal-code" type="text" inputmode="numeric" value="${escapeHtml(state.postalCode)}" placeholder="例：4440840" maxlength="8" />
       </div>
       <div class="tq-field">
         <label class="tq-label" for="address">住所（自動入力）</label>
         <input class="tq-input" id="address" type="text" value="${escapeHtml(state.address)}" placeholder="郵便番号から自動入力" />
       </div>
       <div class="tq-field">
         <label class="tq-label" for="city">お住まいの市区町村 <span class="tq-required">*</span></label>
         <input class="tq-input" id="city" type="text" value="${escapeHtml(state.city)}" placeholder="例：岡崎市" />
       </div>`,
      `<button type="button" class="tq-btn tq-btn-secondary" id="back-btn">戻る</button>
       <button type="button" class="tq-btn tq-btn-primary" id="next-btn">次へ</button>`,
    );
    const postalEl = document.getElementById('postal-code') as HTMLInputElement;
    postalEl?.addEventListener('blur', () => void lookupZipAndFill());
    bindBack(3);
    bindNext(() => {
      state.customerName = (document.getElementById('customer-name') as HTMLInputElement).value.trim();
      state.furigana = (document.getElementById('furigana') as HTMLInputElement).value.trim();
      state.postalCode = (document.getElementById('postal-code') as HTMLInputElement).value.trim();
      state.address = (document.getElementById('address') as HTMLInputElement).value.trim();
      state.city = (document.getElementById('city') as HTMLInputElement).value.trim();
      if (!state.customerName || !state.furigana || !state.city) {
        showError('お名前・フリガナ・市区町村は必須です');
        return false;
      }
      clearError();
      return true;
    }, 5);
    return;
  }

  if (state.step === 5) {
    app.innerHTML = renderShell(
      'ご希望・スケジュール',
      '',
      `<div class="tq-field">
         <label class="tq-label" for="primary-purpose">この問い合わせの一番の目的は何ですか？ <span class="tq-required">*</span></label>
         <textarea class="tq-textarea" id="primary-purpose" placeholder="例：キッチン床の傷を直したい">${escapeHtml(state.primaryPurpose)}</textarea>
       </div>
       <div class="tq-field">
         <p class="tq-label">ご希望の完了期日 <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('deadline', DEADLINE_OPTIONS, state.deadlinePreference)}</div>
       </div>
       <div class="tq-field">
         <label class="tq-label" for="specific-deadline">具体的な希望日</label>
         <p class="tq-hint">具体的な希望があれば入力してください</p>
         <input class="tq-input" id="specific-deadline" type="text" value="${escapeHtml(state.specificDeadlineDate)}" placeholder="例：6月下旬、平日午前中など" />
       </div>
       <div class="tq-field">
         <label class="tq-label" for="work-schedule">作業希望日／不可日</label>
         <p class="tq-hint">不可の日もあれば入力してください</p>
         <textarea class="tq-textarea" id="work-schedule" placeholder="例：土日は不可、来週の火曜は作業可能">${escapeHtml(state.workScheduleNotes)}</textarea>
       </div>
       <div class="tq-field">
         <p class="tq-label">ご要望 <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('request_preference', REQUEST_PREFERENCES, state.requestPreference)}</div>
       </div>
       <div class="tq-field">
         <p class="tq-label">お見積り・リペアは初めてですか？ <span class="tq-required">*</span></p>
         <div class="tq-options">${renderRadioOptions('first_time', FIRST_TIME_OPTIONS, state.firstTimeRepair)}</div>
       </div>
       <div class="tq-field">
         <label class="tq-label" for="noticed-since">いつ頃から気になり始めましたか？</label>
         <input class="tq-input" id="noticed-since" type="text" value="${escapeHtml(state.noticedSince)}" placeholder="任意（例：先月から）" />
       </div>`,
      `<button type="button" class="tq-btn tq-btn-secondary" id="back-btn">戻る</button>
       <button type="button" class="tq-btn tq-btn-primary" id="next-btn">次へ</button>`,
    );
    bindBack(4);
    bindNext(() => {
      state.primaryPurpose = (document.getElementById('primary-purpose') as HTMLTextAreaElement).value.trim();
      const deadline = document.querySelector<HTMLInputElement>('input[name="deadline"]:checked');
      const requestPref = document.querySelector<HTMLInputElement>('input[name="request_preference"]:checked');
      const firstTime = document.querySelector<HTMLInputElement>('input[name="first_time"]:checked');
      if (!state.primaryPurpose || !deadline || !requestPref || !firstTime) {
        showError('必須項目を入力・選択してください');
        return false;
      }
      state.deadlinePreference = deadline.value;
      state.specificDeadlineDate = (document.getElementById('specific-deadline') as HTMLInputElement).value.trim();
      state.workScheduleNotes = (document.getElementById('work-schedule') as HTMLTextAreaElement).value.trim();
      state.requestPreference = requestPref.value;
      state.firstTimeRepair = firstTime.value;
      state.noticedSince = (document.getElementById('noticed-since') as HTMLInputElement).value.trim();
      clearError();
      return true;
    }, 6);
    return;
  }

  // Step 6
  app.innerHTML = renderShell(
    '連絡方法・確認',
    '',
    `<div class="tq-field">
       <p class="tq-label">ご希望の連絡手段 <span class="tq-required">*</span></p>
       <p class="tq-hint">複数選択できます</p>
       <div class="tq-options">${renderCheckboxOptions('contact_method', [...CONTACT_METHODS], state.contactMethods)}</div>
     </div>
     <div class="tq-field" id="phone-field">
       <label class="tq-label" for="phone">お電話番号${needsPhone(state.contactMethods) ? ' <span class="tq-required">*</span>' : ''}</label>
       <p class="tq-hint">お急ぎの方は電話番号を入力してください</p>
       <input class="tq-input" id="phone" type="tel" value="${escapeHtml(state.phone)}" placeholder="例：09012345678" />
     </div>
     <div class="tq-field" id="email-field" style="${needsEmail(state.contactMethods) ? '' : 'display:none'}">
       <label class="tq-label" for="email">メールアドレス <span class="tq-required">*</span></label>
       <input class="tq-input" id="email" type="email" value="${escapeHtml(state.email)}" placeholder="例：name@example.com" />
     </div>
     <div class="tq-field">
       <p class="tq-label">火災保険の使用について <span class="tq-required">*</span></p>
       <p class="tq-hint">住まいの傷にはご契約の火災保険・借家人賠償が適用できる場合があります</p>
       <div class="tq-options">${renderRadioOptions('fire_insurance', FIRE_INSURANCE_OPTIONS, state.fireInsurance)}</div>
     </div>
     <div class="tq-field">
       <p class="tq-privacy">ご入力いただいた個人情報は、お問い合わせの対応およびサービス提供のために利用させていただきます。</p>
       <label class="tq-option${state.privacyConsent ? ' selected' : ''}">
         <input type="checkbox" id="privacy-consent"${state.privacyConsent ? ' checked' : ''} />
         <span>個人情報の取り扱いについて同意する <span class="tq-required">*</span></span>
       </label>
     </div>`,
    `<button type="button" class="tq-btn tq-btn-secondary" id="back-btn">戻る</button>
     <button type="button" class="tq-btn tq-btn-primary" id="submit-btn">送信する</button>`,
  );

  bindBack(5);
  document.querySelectorAll('input[name="contact_method"]').forEach((el) => {
    el.addEventListener('change', () => {
      state.contactMethods = [
        ...document.querySelectorAll<HTMLInputElement>('input[name="contact_method"]:checked'),
      ].map((x) => x.value);
      const phoneLabel = document.querySelector('#phone-field .tq-label');
      const emailField = document.getElementById('email-field');
      if (phoneLabel) {
        phoneLabel.innerHTML = `お電話番号${needsPhone(state.contactMethods) ? ' <span class="tq-required">*</span>' : ''}`;
      }
      if (emailField) emailField.style.display = needsEmail(state.contactMethods) ? '' : 'none';
    });
  });
  document.getElementById('privacy-consent')?.addEventListener('change', (e) => {
    state.privacyConsent = (e.target as HTMLInputElement).checked;
    const label = (e.target as HTMLInputElement).closest('.tq-option');
    label?.classList.toggle('selected', state.privacyConsent);
  });
  document.getElementById('submit-btn')?.addEventListener('click', () => void submitForm());
}

async function lookupZipAndFill(): Promise<void> {
  const postalEl = document.getElementById('postal-code') as HTMLInputElement | null;
  const addressEl = document.getElementById('address') as HTMLInputElement | null;
  const cityEl = document.getElementById('city') as HTMLInputElement | null;
  if (!postalEl) return;
  const addr = await lookupJapaneseAddress(postalEl.value);
  if (!addr) return;
  if (addressEl) addressEl.value = addr;
  if (cityEl && !cityEl.value.trim()) {
    const m = addr.match(/(.+?[都道府県])(.+?[市区町村])/);
    if (m) cityEl.value = m[2];
  }
}

function collectStep6(): boolean {
  const contactChecked = [...document.querySelectorAll<HTMLInputElement>('input[name="contact_method"]:checked')];
  const fire = document.querySelector<HTMLInputElement>('input[name="fire_insurance"]:checked');
  const privacy = document.getElementById('privacy-consent') as HTMLInputElement | null;

  if (contactChecked.length === 0 || !fire) {
    showError('必須項目を選択してください');
    return false;
  }

  state.contactMethods = contactChecked.map((x) => x.value);
  state.phone = (document.getElementById('phone') as HTMLInputElement).value.trim();
  state.email = (document.getElementById('email') as HTMLInputElement).value.trim();
  state.fireInsurance = fire.value;
  state.privacyConsent = privacy?.checked ?? false;

  if (needsPhone(state.contactMethods) && !state.phone) {
    showError('お電話番号を入力してください');
    return false;
  }
  if (needsEmail(state.contactMethods) && !state.email) {
    showError('メールアドレスを入力してください');
    return false;
  }
  if (!state.privacyConsent) {
    showError('個人情報の取り扱いに同意してください');
    return false;
  }
  clearError();
  return true;
}

function buildSubmissionData(): Record<string, string> {
  const hasFreeInputArea = needsAreaDetail(state.targetAreas);
  const data: Record<string, string> = {
    consultation_type: state.consultationType,
    target_areas: formatTargetAreasForSubmission(state.targetAreas, state.targetAreaDetail),
    customer_type: state.customerType,
    housing_type: state.housingType,
    damage_cause: state.damageCause,
    under_construction: state.underConstruction,
    customer_name: state.customerName,
    furigana: state.furigana,
    city: state.city,
    primary_purpose: state.primaryPurpose,
    deadline_preference: state.deadlinePreference,
    request_preference: state.requestPreference,
    first_time_repair: state.firstTimeRepair,
    contact_method: state.contactMethods.join('、'),
    fire_insurance: state.fireInsurance,
    privacy_consent: '同意済み',
  };
  // 詳細は target_areas に統合済みのため、自由入力選択時は別フィールドに重複保存しない
  if (state.targetAreaDetail && !hasFreeInputArea) {
    data.target_area_detail = state.targetAreaDetail;
  }
  if (state.postalCode) data.postal_code = state.postalCode;
  if (state.address) data.address = state.address;
  if (state.specificDeadlineDate) data.specific_deadline_date = state.specificDeadlineDate;
  if (state.workScheduleNotes) data.work_schedule_notes = state.workScheduleNotes;
  if (state.noticedSince) data.noticed_since = state.noticedSince;
  if (state.phone) data.phone = state.phone;
  if (state.email) data.email = state.email;
  return data;
}

async function submitForm(): Promise<void> {
  if (!collectStep6()) return;

  const btn = document.getElementById('submit-btn') as HTMLButtonElement | null;
  if (btn) {
    btn.disabled = true;
    btn.textContent = '送信中...';
  }

  try {
    const res = await fetch(`/api/forms/${state.formId}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(liff.getIDToken() ? { Authorization: `Bearer ${liff.getIDToken()}` } : {}),
      },
      body: JSON.stringify({ lineUserId: state.lineUserId, data: buildSubmissionData() }),
    });
    const json = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !json.success) throw new Error(json.error ?? '送信に失敗しました');
    renderSuccess();
  } catch (err) {
    showError(err instanceof Error ? err.message : '送信に失敗しました');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '送信する';
    }
  }
}

const SUCCESS_PHOTO_TEXT = `お問い合わせありがとうございます。送信が完了しました。

続いて、お見積り用の写真（①アップ ②約50cm ③全景）をこのLINEのトークに送ってください。
動画を送っていただけると状況がより分かりやすく、大変ありがたいです。`;

function renderSuccess(): void {
  getApp().innerHTML = `
    <div class="tq-page">
      <div class="tq-card tq-success">
        <h2>送信完了</h2>
        <p style="text-align:left;white-space:pre-line;">${escapeHtml(SUCCESS_PHOTO_TEXT)}</p>
        ${liff.isInClient() ? '<button type="button" class="tq-btn tq-btn-primary" id="close-btn" style="margin-top:24px;max-width:200px;margin-left:auto;margin-right:auto;display:block;">閉じる</button>' : ''}
      </div>
    </div>`;
  document.getElementById('close-btn')?.addEventListener('click', () => liff.closeWindow());
}

function renderError(message: string): void {
  injectStyles();
  getApp().innerHTML = `<div class="tq-page"><div class="tq-card"><p class="tq-error">${escapeHtml(message)}</p></div></div>`;
}

export async function initTacteqInquiry(formId: string | null): Promise<void> {
  if (!formId) {
    renderError('フォームIDが指定されていません');
    return;
  }
  state.formId = formId;

  try {
    const profile = await liff.getProfile();
    state.lineUserId = profile.userId;
    state.displayName = profile.displayName;
    if (!state.customerName) state.customerName = profile.displayName;
  } catch {
    renderError('LINEプロフィールの取得に失敗しました');
    return;
  }

  const res = await fetch(`/api/forms/${formId}`);
  if (!res.ok) {
    renderError('フォームが見つかりません');
    return;
  }
  const json = (await res.json()) as { success?: boolean; data?: { isActive?: boolean } };
  if (!json.success || !json.data?.isActive) {
    renderError('このフォームは現在受付を停止しています');
    return;
  }

  render();
}
