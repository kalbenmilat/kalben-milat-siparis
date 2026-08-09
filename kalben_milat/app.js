/**
 * KALBEN MİLAT - ULTRA GELİŞMİŞ FORM UYGULAMASI (V4 - SECURE BACKEND EDITION)
 * Sunucu Taraflı Shopier Doğrulaması, Tam UI Koruması ve Bellek Optimizasyonu.
 */

(function () {
    'use strict';

    // --- 1. AYARLAR ---
    // (Güvenlik nedeniyle frontend artık Supabase'e doğrudan bağlanmıyor.
    // Tüm işlemler güvenli Netlify sunucu fonksiyonları üzerinden geçiyor.)
    const C = window.KM_CONFIG || {};

    // --- 2. DOM ELEMENTLERİ (Önbelleğe Alma) ---
    const DOM = {
        form: document.getElementById('form'),
        steps: Array.from(document.querySelectorAll('.step')),
        nextBtn: document.getElementById('next'),
        backBtn: document.getElementById('back'),
        progressBar: document.getElementById('bar'),
        stepNo: document.getElementById('stepNo'),
        stepTitle: document.getElementById('stepTitle'),
        photosInput: document.getElementById('photos'),
        pickBtn: document.getElementById('pick'),
        preview: document.getElementById('preview'),
        photoStatus: document.getElementById('photoStatus'),
        extraContainer: document.getElementById('extra'),
        summaryContainer: document.getElementById('summary'),
        submitStatus: document.getElementById('submitStatus'),
        choicesGroup: document.querySelector('.choices-grid'),
        orderIdInput: document.getElementById('orderId')
    };

    // --- 3. UYGULAMA DURUMU (STATE) ---
    const STATE = {
        step: 1,
        files: [],
        maxFiles: 6,
        sessionToken: null, // Arka uçtan gelecek 1 saatlik güvenli geçiş jetonu
        stepTitles: ["Hediye türü", "Hikâye bilgileri", "Fotoğraflar", "Son kontrol"],
        labels: {
            sevgili: "Sevgilime", es: "Eşime", dogum_gunu: "Doğum günü", 
            yildonumu: "Yıldönümü", ozur_barisma: "Özür & Barışma", 
            uzak_mesafe: "Uzak mesafe", aile: "Ailem", arkadas: "Arkadaşıma"
        }
    };

    // --- 4. YARDIMCI FONKSİYONLAR ---
    const utils = {
        escapeHTML: (str) => String(str || "").replace(/[&<>"']/g, m => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        }[m])),
        
        clearErrors: () => {
            document.querySelectorAll('.error-msg').forEach(el => el.textContent = '');
            document.querySelectorAll('.form-input, .form-textarea').forEach(el => el.style.borderColor = '');
        },

        showError: (input, message) => {
            const group = input.closest('.form-group') || input.closest('fieldset');
            if (group) {
                const errorEl = group.querySelector('.error-msg');
                if (errorEl) {
                    errorEl.textContent = message;
                    errorEl.style.animation = 'fadeIn 0.3s ease';
                }
                if (input.classList.contains('form-input') || input.classList.contains('form-textarea')) {
                    input.style.borderColor = '#ef4444'; 
                }
                group.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    };

    // --- 5. ADIM YÖNETİMİ VE UX ---
    const FormController = {
        init() {
            this.bindEvents();
            this.applyFormatters();
            this.showStep(1);
        },

        applyFormatters() {
            if (DOM.orderIdInput) {
                DOM.orderIdInput.addEventListener('input', function() {
                    // Türkçe karakterleri çevir, boşlukları sil, büyük harf yap
                    this.value = this.value.toLocaleUpperCase('tr-TR').replace(/\s+/g, '');
                });
            }
        },

        bindEvents() {
            DOM.nextBtn.addEventListener('click', () => this.handleNext());
            DOM.backBtn.addEventListener('click', () => this.showStep(STATE.step - 1));
            
            if (DOM.choicesGroup) {
                DOM.choicesGroup.addEventListener('change', () => this.renderExtraFields());
            }

            this.bindCounters();
            
            DOM.pickBtn.addEventListener('click', () => DOM.photosInput.click());
            DOM.photosInput.addEventListener('change', (e) => PhotoManager.handleFiles(e.target.files));
            
            const uploadArea = DOM.pickBtn.parentElement;
            uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.opacity = '0.7'; uploadArea.style.borderColor = 'var(--brand-primary)'; });
            uploadArea.addEventListener('dragleave', () => { uploadArea.style.opacity = '1'; uploadArea.style.borderColor = ''; });
            uploadArea.addEventListener('drop', e => {
                e.preventDefault();
                uploadArea.style.opacity = '1';
                uploadArea.style.borderColor = '';
                PhotoManager.handleFiles(e.dataTransfer.files);
            });
        },

        showStep(n) {
            STATE.step = n;
            utils.clearErrors(); 
            
            DOM.steps.forEach(stepEl => {
                stepEl.classList.toggle('active', parseInt(stepEl.dataset.step) === n);
            });

            DOM.progressBar.style.width = (n * 25) + "%";
            DOM.stepNo.textContent = `${n} / 4`;
            DOM.stepTitle.textContent = STATE.stepTitles[n - 1];
            
            DOM.backBtn.disabled = (n === 1);
            DOM.nextBtn.innerHTML = n === 4 
                ? 'Gönder ❤️ <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>' 
                : 'Devam Et <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>';

            if (n === 2) this.renderExtraFields();
            if (n === 4) this.generateSummary();
            
            window.scrollTo({ top: 0, behavior: "smooth" });
        },

        async handleNext() {
            if (!this.validateCurrentStep()) return;
            
            // 1. Adımdan 2. Adıma geçerken Sunucu Doğrulaması (Shopier ID & Captcha)
            if (STATE.step === 1 && !STATE.sessionToken) {
                const isVerified = await SubmitManager.verifyOrderBackend();
                if (!isVerified) return; // Doğrulama başarısızsa sonraki adıma geçme
            }

            if (STATE.step < 4) {
                this.showStep(STATE.step + 1);
            } else {
                SubmitManager.processData();
            }
        },

        validateCurrentStep() {
            utils.clearErrors();
            let isValid = true;
            const currentStepEl = DOM.steps[STATE.step - 1];
            
            const requiredElements = currentStepEl.querySelectorAll('[required]');
            for (let el of requiredElements) {
                if (el.type === 'radio') continue;
                
                if (!el.value.trim()) {
                    utils.showError(el, 'Lütfen bu alanı doldurun.');
                    if (isValid) el.focus(); 
                    isValid = false;
                }
            }

            if (STATE.step === 1) {
                if (!this.getPurpose()) {
                    utils.showError(document.querySelector('.choices-grid'), 'Lütfen bir sayfa konsepti seçin.');
                    isValid = false;
                }
                if (DOM.orderIdInput && DOM.orderIdInput.value.length < 3) {
                    utils.showError(DOM.orderIdInput, 'Sipariş numarası en az 3 karakter olmalıdır.');
                    isValid = false;
                }
            }

            if (STATE.step === 3) {
                if (STATE.files.length < 1 || STATE.files.length > STATE.maxFiles) {
                    DOM.photoStatus.style.color = '#ef4444';
                    DOM.photoStatus.style.fontWeight = 'bold';
                    DOM.photoStatus.textContent = `Lütfen ${STATE.maxFiles} adete kadar fotoğraf yükleyin (Şu an: ${STATE.files.length})`;
                    isValid = false;
                }
            }

            return isValid;
        },

        getPurpose() {
            const checked = DOM.form.querySelector('input[name="purpose"]:checked');
            return checked ? checked.value : null;
        },

        bindCounters() {
            document.querySelectorAll('input[maxlength], textarea[maxlength]').forEach(input => {
                const counter = input.closest('.form-group')?.querySelector('.char-counter');
                if (!counter) return;
                
                const updateCounter = () => {
                    counter.textContent = `${input.value.length} / ${input.maxLength}`;
                    if(input.value.length >= input.maxLength * 0.9) counter.style.color = '#f59e0b';
                    else counter.style.color = '';
                };
                
                input.removeEventListener('input', updateCounter);
                input.addEventListener('input', updateCounter);
                updateCounter();
            });
        },

        renderExtraFields() {
            const purpose = this.getPurpose();
            if (!purpose) return;

            const htmlTemplates = {
                sevgili: `<div class="form-group mt-large fade-in"><label class="form-label">İsterseniz birlikte ne kadar zamandır? <em class="optional-text">(isteğe bağlı)</em></label><div class="input-wrapper"><input type="text" name="extraInfo" class="form-input" maxlength="50" placeholder="Örn. 2 yıl 4 ay"></div><div class="form-footer"><span class="error-msg"></span><small class="char-counter">0 / 50</small></div></div>`,
                es: `<div class="form-group mt-large fade-in"><label class="form-label">Evlilik tarihiniz <em class="optional-text">(isteğe bağlı)</em></label><div class="input-wrapper"><input type="date" name="extraDate" class="form-input"></div></div>`,
                dogum_gunu: `<div class="form-group mt-large fade-in"><label class="form-label">Kaçıncı doğum günü? <em class="optional-text">(isteğe bağlı)</em></label><div class="input-wrapper"><input type="text" name="extraInfo" class="form-input" maxlength="3" inputmode="numeric" placeholder="Örn. 24"></div><div class="form-footer"><span class="error-msg"></span><small class="char-counter">0 / 3</small></div></div>`,
                yildonumu: `<div class="form-group mt-large fade-in"><label class="form-label">Yıldönümü türü</label><div class="input-wrapper"><input type="text" name="extraInfo" class="form-input" maxlength="30" placeholder="Tanışma / sevgililik / evlilik"></div><div class="form-footer"><span class="error-msg"></span><small class="char-counter">0 / 30</small></div></div>`,
                uzak_mesafe: `<div class="form-group mt-large fade-in"><label class="form-label">Birlikte olduğunuz şehirler <em class="optional-text">(isteğe bağlı)</em></label><div class="input-wrapper"><input type="text" name="extraInfo" class="form-input" maxlength="50" placeholder="Örn. Samsun → Balıkesir"></div><div class="form-footer"><span class="error-msg"></span><small class="char-counter">0 / 50</small></div></div>`,
                aile: `<div class="form-group mt-large fade-in"><label class="form-label">Ailenize nasıl hitap edelim? <em class="optional-text">(isteğe bağlı)</em></label><div class="input-wrapper"><input type="text" name="extraInfo" class="form-input" maxlength="50" placeholder="Örn. Canım ailem"></div><div class="form-footer"><span class="error-msg"></span><small class="char-counter">0 / 50</small></div></div>`,
                arkadas: `<div class="form-group mt-large fade-in"><label class="form-label">Arkadaşınızın adı / lakabı <em class="optional-text">(isteğe bağlı)</em></label><div class="input-wrapper"><input type="text" name="extraInfo" class="form-input" maxlength="50" placeholder="Örn. Kanka"></div><div class="form-footer"><span class="error-msg"></span><small class="char-counter">0 / 50</small></div></div>`,
                ozur_barisma: `<div class="legal-notice mt-large fade-in" style="background:#fff7f4; color:#7c554e; border-color: #ffd8cc;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-small"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><p>Özel mesajınız bu bölümün en önemli kısmı. Lütfen 3. adımda kalbinizden geçenleri şeffafça yazmayı unutmayın. ❤️</p></div>`
            };

            DOM.extraContainer.innerHTML = htmlTemplates[purpose] || "";
            this.bindCounters(); 
        },

        generateSummary() {
            const d = Object.fromEntries(new FormData(DOM.form).entries());
            const dateStr = d.date ? new Date(d.date).toLocaleDateString("tr-TR") : "Belirtilmedi";
            const nicknameStr = d.nickname ? ` <em style="color:#64748b; font-size: 13px;">(${utils.escapeHTML(d.nickname)})</em>` : "";
            
            DOM.summaryContainer.innerHTML = `
                <div style="margin-bottom:10px; font-size: 15px;"><strong style="color:var(--text-main)">Hediye Türü:</strong> ${utils.escapeHTML(STATE.labels[d.purpose])}</div>
                <div style="margin-bottom:10px; font-size: 15px;"><strong style="color:var(--text-main)">Alıcı:</strong> ${utils.escapeHTML(d.recipient)}${nicknameStr}</div>
                <div style="margin-bottom:10px; font-size: 15px;"><strong style="color:var(--text-main)">Shopier Sipariş No:</strong> <span style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${utils.escapeHTML(d.orderId)}</span></div>
                <div style="margin-bottom:10px; font-size: 15px;"><strong style="color:var(--text-main)">Sayfa Başlığı:</strong> ${utils.escapeHTML(d.title)}</div>
                <div style="margin-bottom:10px; font-size: 15px;"><strong style="color:var(--text-main)">Özel Tarih:</strong> ${dateStr}</div>
                <div style="margin-top:16px; padding-top:16px; border-top:1px dashed #cbd5e1; font-size: 15px;">
                    <strong style="color:var(--text-main)">📸 Yüklenen Medya:</strong> <span style="color:var(--brand-primary); font-weight:800; background: var(--brand-light); padding: 2px 8px; border-radius: 12px;">${STATE.files.length} Fotoğraf</span>
                </div>
            `;
        },

        showSuccessScreen() {
            const card = document.querySelector('.card');
            card.innerHTML = `
                <div class="success" style="animation: fadeIn 0.8s cubic-bezier(0.4, 0, 0.2, 1); text-align: center; padding: 40px 20px;">
                    <div style="font-size: 64px; margin-bottom: 20px;">🎉</div>
                    <h1 style="font-family: Georgia, serif; font-size: 28px; margin-bottom: 12px; color: var(--text-main);">Anılarınız Bize Ulaştı!</h1>
                    <p style="color: var(--text-muted); font-size: 15px; line-height: 1.7; margin-bottom: 24px;">
                        Verileriniz ve yüklediğiniz fotoğraflar üst düzey şifreleme ile sunucularımıza kaydedildi.<br><br>
                        Tasarım ekibimiz size özel olan bu sayfayı büyük bir özenle hazırlamaya başlıyor. İşlem tamamlandığında sizinle iletişime geçeceğiz. Bizi tercih ettiğiniz için teşekkürler! ❤️
                    </p>
                </div>
            `;
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    // --- 6. FOTOĞRAF YÖNETİMİ ---
    const PhotoManager = {
        handleFiles(fileList) {
            if (!fileList || fileList.length === 0) return;
            const newFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
            
            if (STATE.files.length + newFiles.length > STATE.maxFiles) {
                alert(`Maksimum sınır aşıldı! En fazla ${STATE.maxFiles} fotoğraf yükleyebilirsiniz.`);
                return;
            }
            
            STATE.files.push(...newFiles);
            DOM.photosInput.value = ""; 
            this.renderPreviews();
        },

        removeFile(index) {
            STATE.files.splice(index, 1);
            this.renderPreviews();
        },

        renderPreviews() {
            DOM.preview.innerHTML = "";
            STATE.files.forEach((file, i) => {
                const div = document.createElement("div");
                div.className = "thumb fade-in";
                
                const img = document.createElement("img");
                img.src = URL.createObjectURL(file);
                img.onload = () => URL.revokeObjectURL(img.src);
                
                const deleteBtn = document.createElement("span");
                deleteBtn.className = "delete-btn";
                deleteBtn.innerHTML = "&times;"; 
                deleteBtn.title = "Görseli Kaldır";
                deleteBtn.onclick = () => this.removeFile(i);
                
                div.appendChild(img);
                div.appendChild(deleteBtn);
                DOM.preview.appendChild(div);
            });
            
            DOM.photoStatus.style.color = ''; 
            DOM.photoStatus.style.fontWeight = 'normal';
            DOM.photoStatus.textContent = `${STATE.files.length} / ${STATE.maxFiles} fotoğraf yüklendi`;
        }
    };

    // --- 7. VERİ GÖNDERİMİ VE SUNUCU BAĞLANTISI (SECURE SUBMIT) ---
    const SubmitManager = {
        // İstemci tarafında görselleri WebP formatında Base64'e dönüştürür (Netlify Backend'e yollamak için)
        async optimizeImage(file) {
            try {
                const bitmap = await createImageBitmap(file);
                const MAX_SIZE = 1600;
                const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
                
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(bitmap.width * scale);
                canvas.height = Math.round(bitmap.height * scale);
                
                const ctx = canvas.getContext('2d', { alpha: false });
                ctx.fillStyle = "#FFFFFF"; 
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                bitmap.close(); 
                
                return canvas.toDataURL("image/webp", 0.85); // Backend için Base64 formatı
            } catch (err) {
                console.error("Görsel işleme hatası:", err);
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }
        },

        // ADIM 1: Siparişin geçerliliğini arka uçta kontrol et
        async verifyOrderBackend() {
            const orderId = DOM.orderIdInput.value.trim();
            const captchaToken = document.querySelector('[name="cf-turnstile-response"]')?.value;

            if (!captchaToken) {
                this.showStatus('Güvenlik doğrulaması (Captcha) eksik. Lütfen kutucuğu işaretleyin.', true);
                utils.showError(DOM.orderIdInput, 'Güvenlik doğrulamasını tamamlayın.');
                return false;
            }

            DOM.nextBtn.disabled = true;
            DOM.nextBtn.innerHTML = '<span style="animation: pulse 1s infinite">Doğrulanıyor...</span>';

            try {
                const response = await fetch('/.netlify/functions/verify-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId, turnstileToken: captchaToken })
                });

                const data = await response.json();

                if (!response.ok) {
                    utils.showError(DOM.orderIdInput, data.message || 'Sipariş numarası doğrulanamadı.');
                    DOM.nextBtn.disabled = false;
                    DOM.nextBtn.innerHTML = 'Devam Et <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>';
                    if (window.turnstile) window.turnstile.reset();
                    return false;
                }

                // Sunucudan gelen güvenli oturum jetonunu kaydet
                STATE.sessionToken = data.token;
                DOM.nextBtn.disabled = false;
                DOM.nextBtn.innerHTML = 'Devam Et <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>';
                return true;

            } catch (err) {
                console.error('Doğrulama Hatası:', err);
                utils.showError(DOM.orderIdInput, 'Sunucu ile iletişim kurulamadı. Lütfen tekrar deneyin.');
                DOM.nextBtn.disabled = false;
                DOM.nextBtn.innerHTML = 'Devam Et <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><path d="M5 12h14M12 5l7 7-7 7"></path></svg>';
                return false;
            }
        },

        // ADIM 2: Tüm verileri ve görselleri güvenli arka uca (Netlify) gönder
        async processData() {
            if (!STATE.sessionToken) {
                this.showStatus('Oturum süreniz dolmuş veya yetkisiz erişim. Lütfen sayfayı yenileyin.', true);
                return;
            }

            DOM.nextBtn.disabled = true;
            DOM.backBtn.disabled = true;
            DOM.nextBtn.innerHTML = '<span style="animation: pulse 1s infinite">Sipariş İşleniyor...</span>';

            try {
                // Fotoğrafları Base64 (WebP) formatına çevir
                const base64Photos = [];
                for (let i = 0; i < STATE.files.length; i++) {
                    this.showStatus(`Anılarınız hazırlanıyor... (${i + 1}/${STATE.files.length})`);
                    const base64Image = await this.optimizeImage(STATE.files[i]);
                    base64Photos.push(base64Image);
                }

                this.showStatus('Bilgileriniz güvenli sunucuya aktarılıyor...');
                const formData = Object.fromEntries(new FormData(DOM.form).entries());

                const response = await fetch('/.netlify/functions/submit-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${STATE.sessionToken}` // Güvenli Token ekleniyor
                    },
                    body: JSON.stringify({
                        purpose: formData.purpose,
                        recipient: formData.recipient,
                        nickname: formData.nickname,
                        title: formData.title,
                        message: formData.message,
                        date: formData.date,
                        music: formData.music,
                        extraInfo: formData.extraInfo,
                        extraDate: formData.extraDate,
                        photos: base64Photos // Fotoğraflar güvenli bir şekilde Payload içine gömüldü
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || 'Siparişiniz kaydedilirken bir sorun oluştu.');
                }

                // BAŞARILI BİTİŞ
                FormController.showSuccessScreen();

            } catch (error) {
                console.error("Gönderim Reddedildi:", error);
                this.showStatus(error.message || 'Ağ veya sunucu hatası oluştu. Lütfen tekrar deneyin.', true);
                
                DOM.nextBtn.disabled = false;
                DOM.backBtn.disabled = false;
                DOM.nextBtn.innerHTML = 'Tekrar Dene <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>';
            }
        },

        showStatus(message, isError = false) {
            DOM.submitStatus.style.color = isError ? '#ef4444' : '#64748b';
            DOM.submitStatus.style.fontWeight = isError ? 'bold' : 'normal';
            DOM.submitStatus.textContent = message;
        }
    };

    // --- Başlat ---
    FormController.init();

})();