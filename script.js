// --- SOUND EFFECTS (Web Audio API, tanpa file eksternal) ---
const Sound = {
    enabled: true,
    ctx: null,

    getCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
        }
        return this.ctx;
    },

    tone(freq, duration, type = 'sine', delay = 0, gain = 0.2) {
        if (!this.enabled) return;
        try {
            const ctx = this.getCtx();
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            osc.connect(g);
            g.connect(ctx.destination);
            const startAt = ctx.currentTime + delay;
            g.gain.setValueAtTime(gain, startAt);
            g.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
            osc.start(startAt);
            osc.stop(startAt + duration);
        } catch (e) { /* audio diblokir browser, abaikan */ }
    },

    correct() {
        this.tone(523.25, 0.15, 'triangle', 0);
        this.tone(783.99, 0.2, 'triangle', 0.12);
    },

    wrong() {
        this.tone(180, 0.3, 'sawtooth', 0, 0.15);
    },

    timeout() {
        this.tone(140, 0.4, 'sawtooth', 0, 0.15);
    },

    kingChange() {
        this.tone(392, 0.12, 'triangle', 0);
        this.tone(523.25, 0.12, 'triangle', 0.13);
        this.tone(659.25, 0.22, 'triangle', 0.26);
    },

    victory() {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone(f, 0.25, 'triangle', i * 0.15));
    },

    toggle() {
        this.enabled = !this.enabled;
        const btn = document.getElementById('btn-sound');
        if (btn) btn.innerText = this.enabled ? '🔊' : '🔇';
    }
};

const Game = {
    roasts: {
        kingWins: [
            "Tahta ini terlalu tinggi buatmu, ${target}!", 
            "Minggir kamu ${target}! Raja tak terkalahkan.", 
            "Cuma segitu kemampuanmu, ${target}?"
        ],
        chalWins: [
            "Raja baru telah tiba! Turun kamu ${target}!", 
            "Payah kamu ${target}, tahta ini milikku!", 
            "Rakyat bosan denganmu, ${target}!"
        ],
        audienceRoast: [
            "Penonton kecewa! ${k} dan ${c} sama-sama zonk!", 
            "Mending kalian berdua pulang aja!", 
            "Dewa pun geleng-geleng melihat ${k} dan ${c}."
        ]
    },

    db: [{ q: "Siapa kaisar pembangun Colosseum?", a: "Vespasianus", o: ["Nero", "Caesar", "Augustus"] }],
    
    state: { 
        players: [], 
        king: null, 
        queue: [], 
        scores: {}, 
        currentRound: 1, 
        maxRounds: 3, 
        duelCount: 0, 
        isLock: false, 
        answered: { king: false, chal: false },
        materi: null,
        kelas: null,
        semester: null,
        filteredQuestions: [],
        ansLet: null,
        dataLoaded: false,
        usedQuestions: [],
        timeLimit: 45,
        timeLeft: 45,
        timerId: null,
        isPaused: false,
        pausedButtons: []
    },

    // --- NAVIGATION ---
    switchScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        document.getElementById(id).classList.remove('hidden');
        if (id === 'screen-intro') this.playIntro();
    },

    playIntro() {
        setTimeout(() => document.getElementById('i1').style.opacity = "1", 1000);
        setTimeout(() => document.getElementById('i2').style.opacity = "1", 2500);
        setTimeout(() => document.getElementById('i3').style.opacity = "1", 4000);
        setTimeout(() => document.getElementById('gb').style.opacity = "1", 5500);
    },

    // --- DATA & SELECTION ---
    loadFromGSS() {
        const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSkQqLHfqQtnvAw5FB_Qfl7Gtg8G5w4KTkQWihrpHAakEDi42rFHYlW39AOM0DI1d2nvWfZ0BjRoPiE/pub?output=csv";
        fetch(url)
            .then(res => res.text())
            .then(csv => {
                const rows = parseCSV(csv);
                rows.shift(); // Remove header
                this.db = rows
                    .map(r => ({
                        kelas: (r[0] || "").trim(),
                        semester: (r[1] || "").trim(),
                        materi: (r[2] || "").trim(),
                        q: (r[3] || "").trim(),
                        a: (r[4] || "").trim(),
                        o: [r[5], r[6], r[7]].map(x => (x || "").trim())
                    }))
                    // Buang baris kosong/rusak (misal baris kosong di akhir sheet)
                    .filter(d => d.materi && d.kelas && d.semester && d.q && d.a);

                this.state.dataLoaded = true;
                this.enableLanjutButton();
                this.refreshFilterOptions();
                console.log("Soal berhasil dimuat:", this.db.length);
            })
            .catch(err => {
                console.error("Gagal ambil GSS:", err);
                const btn = document.getElementById('btn-lanjut');
                if (btn) btn.innerText = "⚠️ GAGAL MEMUAT SOAL";
                showAlert("ARENA BELUM SIAP", "Gagal mengambil soal. Cek koneksi internet, lalu muat ulang halaman (F5).");
            });
    },

    enableLanjutButton() {
        const btn = document.getElementById('btn-lanjut');
        if (btn) {
            btn.disabled = false;
            btn.innerText = "LANJUTKAN ⚔️";
        }
    },

    // --- FILTER DINAMIS: cuma tampilkan opsi yang beneran ada soalnya (rekomendasi #2) ---
    MATERI_ICONS: {
        'aqidah': { icon: '🕌', label: 'Aqidah' },
        'akhlaq': { icon: '✨', label: 'Akhlaq' },
        'quran': { icon: '📖', label: "Al-Qur'an" },
        "al-qur'an": { icon: '📖', label: "Al-Qur'an" },
        'fiqih': { icon: '⚖️', label: 'Fiqih' },
        'tarikh': { icon: '🏛️', label: 'Tarikh' }
    },

    // Ambil subset db sesuai pilihan dropdown SAAT INI, kecuali dimensi "excluding"
    // (dipakai supaya dropdown gak nge-filter dirinya sendiri)
    getFilteredDb(excluding) {
        const materiVal = document.getElementById('materi-select').value;
        const kelasVal = document.getElementById('kelas-select').value;
        const semesterVal = document.getElementById('semester-select').value;

        return this.db.filter(d => {
            if (excluding !== 'materi' && materiVal && d.materi.toLowerCase() !== materiVal.toLowerCase()) return false;
            if (excluding !== 'kelas' && kelasVal && String(d.kelas) !== kelasVal) return false;
            if (excluding !== 'semester' && semesterVal && String(d.semester) !== semesterVal) return false;
            return true;
        });
    },

    refreshFilterOptions() {
        if (!this.state.dataLoaded) return;
        this.populateMateriOptions();
        this.populateKelasOptions();
        this.populateSemesterOptions();
    },

    populateMateriOptions() {
        const select = document.getElementById('materi-select');
        const current = select.value;
        const pool = this.getFilteredDb('materi');

        // Dedupe case-insensitive, pertahankan casing yang pertama muncul
        const seen = {};
        pool.forEach(d => { const k = d.materi.toLowerCase(); if (!seen[k]) seen[k] = d.materi; });
        const distinct = Object.values(seen).sort();

        select.innerHTML = '<option value="">⚔️ Pilih Materi</option>' +
            distinct.map(m => {
                const meta = this.MATERI_ICONS[m.toLowerCase()] || { icon: '📚', label: m };
                return `<option value="${m}">${meta.icon} ${meta.label}</option>`;
            }).join('');

        if (distinct.includes(current)) select.value = current;
    },

    populateKelasOptions() {
        const select = document.getElementById('kelas-select');
        const current = select.value;
        const pool = this.getFilteredDb('kelas');
        const distinct = [...new Set(pool.map(d => String(d.kelas)))].sort((a, b) => Number(a) - Number(b));

        select.innerHTML = '<option value="">🎓 Pilih Kelas</option>' +
            distinct.map(k => `<option value="${k}">Kelas ${k}</option>`).join('');

        if (distinct.includes(current)) select.value = current;
    },

    populateSemesterOptions() {
        const select = document.getElementById('semester-select');
        const current = select.value;
        const pool = this.getFilteredDb('semester');
        const distinct = [...new Set(pool.map(d => String(d.semester)))].sort();

        select.innerHTML = '<option value="">📅 Pilih Semester</option>' +
            distinct.map(s => `<option value="${s}">Semester ${s}</option>`).join('');

        if (distinct.includes(current)) select.value = current;
    },

    // Begitu satu dropdown dipilih, dua dropdown lainnya ikut nge-refresh
    // supaya kombinasi yang gak punya soal gak bisa dipilih sama sekali
    bindFilterListeners() {
        const materiSelect = document.getElementById('materi-select');
        const kelasSelect = document.getElementById('kelas-select');
        const semesterSelect = document.getElementById('semester-select');

        materiSelect.addEventListener('change', () => {
            if (!this.state.dataLoaded) return;
            this.populateKelasOptions();
            this.populateSemesterOptions();
        });
        kelasSelect.addEventListener('change', () => {
            if (!this.state.dataLoaded) return;
            this.populateMateriOptions();
            this.populateSemesterOptions();
        });
        semesterSelect.addEventListener('change', () => {
            if (!this.state.dataLoaded) return;
            this.populateMateriOptions();
            this.populateKelasOptions();
        });
    },

    startSelection() {
        const input = document.getElementById('player-input').value;
        const list = [...new Set(input.split(/[,\n]/).map(s => s.trim()).filter(s => s))];
        
        if (list.length < 2) return alert("Minimal 2 Gladiator!");
        
        this.state.players = list;
        list.forEach(p => this.state.scores[p] = 0);
        this.switchScreen('screen-selection');

        const king = list[Math.floor(Math.random() * list.length)];
        const strip = document.getElementById('roulette-strip');
        
        // Animasi Roulette
        strip.innerHTML = Array(20).fill(list).flat()
            .map(n => `<div style="height:150px;line-height:150px;text-align:center;font-size:2rem;">${n}</div>`)
            .join('') + 
            `<div style="height:150px;line-height:150px;text-align:center;font-size:2.5rem;color:var(--gold);">${king}</div>`;
        
        setTimeout(() => strip.style.top = `-${(strip.children.length - 1) * 150}px`, 100);
        
        setTimeout(() => {
            this.state.king = king;
            this.state.queue = list.filter(p => p !== king).sort(() => Math.random() - 0.5);
            this.showBriefing();
        }, 4500);
    },

    showBriefing() {
        this.switchScreen('screen-briefing');
        document.getElementById('k-brief').innerText = this.state.king;
        document.getElementById('c-brief').innerText = this.state.queue[0];
        document.getElementById('queue-container').innerHTML = this.state.queue
            .map((name, i) => `<div style="background:#2c3e50; padding:8px; font-size:0.9rem;">#${i+1} ${name}</div>`)
            .join('');
    },

    enterArena() {
        this.switchScreen('screen-battle');
        this.loadMatch();
    },

    // --- GAMEPLAY ---
    loadMatch() {
        if (this.state.currentRound > this.state.maxRounds) return this.endGame();
        
        this.state.isLock = false;
        this.state.answered = { king: false, chal: false };
        
        document.getElementById('king-name').innerText = this.state.king;
        document.getElementById('chal-name').innerText = this.state.queue[0];
        document.getElementById('king-score').innerText = this.state.scores[this.state.king];
        document.getElementById('chal-score').innerText = this.state.scores[this.state.queue[0]];
        document.getElementById('round-info').innerText = `PUTARAN ${this.state.currentRound} - DUEL ${this.state.duelCount + 1}`;

        // Antrean berikutnya, sesuai urutan maju (rekomendasi #3)
        const nextList = document.getElementById('next-up-list');
        if (nextList) {
            const upcoming = this.state.queue.slice(1);
            if (upcoming.length === 0) {
                nextList.innerHTML = '<div class="next-up-chip">— Ini duel terakhir di antrean —</div>';
            } else {
                nextList.innerHTML = upcoming.map((name, i) => `
                    <div class="next-up-chip ${i === 0 ? 'next-up-soon' : ''}">
                        <span class="next-up-order">#${i + 1}</span> ${name}
                    </div>
                `).join('');
            }
        }

        // Progress keseluruhan (rekomendasi #4)
        const totalChallengers = this.state.queue.length;
        const totalDuels = this.state.maxRounds * totalChallengers;
        const duelIndexOverall = (this.state.currentRound - 1) * totalChallengers + this.state.duelCount + 1;
        const progressText = document.getElementById('progress-text');
        const progressBar = document.getElementById('progress-bar-inner');
        if (progressText) progressText.innerText = `Duel ${duelIndexOverall} / ${totalDuels}`;
        if (progressBar) progressBar.style.width = `${Math.min(100, ((duelIndexOverall - 1) / totalDuels) * 100)}%`;
        
        let pool = this.state.filteredQuestions;
        if (this.state.kelas) {
            pool = pool.filter(d => String(d.kelas) === String(this.state.kelas));
        }
        if (this.state.materi) {
            pool = pool.filter(d => d.materi === this.state.materi);
        }
        if (this.state.semester) {
            pool = pool.filter(d => String(d.semester) === String(this.state.semester));
        }

        if (pool.length === 0) {
            showAlert("ARENA KOSONG", "Para dewa belum menurunkan soal untuk pertarungan ini...");
            document.getElementById('opt-text').innerHTML = "";
            return;
        }

        // Hindari soal yang sudah keluar (rekomendasi #2). Kalau seluruh pool sudah
        // pernah dipakai, baru dianggap satu putaran penuh selesai dan direset.
        let freshPool = pool.filter(d => !this.state.usedQuestions.includes(d.q));
        if (freshPool.length === 0) {
            this.state.usedQuestions = [];
            freshPool = pool;
        }

        const qData = freshPool[Math.floor(Math.random() * freshPool.length)];
        this.state.usedQuestions.push(qData.q);

        const opts = [qData.a, ...qData.o].sort(() => Math.random() - 0.5);
        this.state.ansLet = String.fromCharCode(65 + opts.indexOf(qData.a));
        
        document.getElementById('q-text').innerText = qData.q;
        document.getElementById('opt-text').innerHTML = opts
            .map((o, i) => `<div><b>${String.fromCharCode(65+i)}.</b> ${o}</div>`)
            .join('');
        
        document.querySelectorAll('.pad-btn').forEach(b => {
            b.classList.remove('wrong', 'correct');
            b.disabled = false;
        });

        this.startTimer();
    },

    // --- TIMER (rekomendasi #1) ---
    startTimer() {
        this.clearTimer();
        this.state.isPaused = false;
        this.state.timeLeft = this.state.timeLimit;

        const bar = document.getElementById('timer-bar-inner');
        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '100%';
            bar.classList.remove('timer-warn', 'timer-danger');
            void bar.offsetWidth; // paksa reflow biar transisi berikutnya mulus
            bar.style.transition = 'width 1s linear, background-color 1s linear';
        }

        this.state.timerId = setInterval(() => this.timerTick(), 1000);
    },

    timerTick() {
        this.state.timeLeft--;
        this.updateTimerBar();

        if (this.state.timeLeft <= 0) {
            this.clearTimer();
            if (!this.state.isLock) {
                this.state.isLock = true;
                document.querySelectorAll('.pad-btn').forEach(b => b.disabled = true);
                Sound.timeout();
                this.showFeedback(null, null, false, null, true);
            }
        }
    },

    updateTimerBar() {
        const bar = document.getElementById('timer-bar-inner');
        if (!bar) return;
        const pct = Math.max(0, (this.state.timeLeft / this.state.timeLimit) * 100);
        bar.style.width = pct + '%';
        bar.classList.remove('timer-warn', 'timer-danger');
        if (this.state.timeLeft <= 3) bar.classList.add('timer-danger');
        else if (this.state.timeLeft <= 6) bar.classList.add('timer-warn');
    },

    clearTimer() {
        if (this.state.timerId) {
            clearInterval(this.state.timerId);
            this.state.timerId = null;
        }
    },

    // --- JEDA DARURAT (rekomendasi #4) ---
    togglePause() {
        if (this.state.isPaused) this.resumeTimer();
        else this.pauseTimer();
    },

    pauseTimer() {
        // Gak bisa jeda kalau timer emang lagi gak jalan (misal pas overlay hasil/roast muncul)
        if (this.state.isPaused || this.state.isLock || !this.state.timerId) return;

        this.state.isPaused = true;
        this.clearTimer();

        this.state.pausedButtons = [];
        document.querySelectorAll('.pad-btn').forEach(b => {
            if (!b.disabled) {
                b.disabled = true;
                this.state.pausedButtons.push(b);
            }
        });

        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.remove('hidden');
        const btn = document.getElementById('btn-pause');
        if (btn) btn.innerText = '▶️ LANJUTKAN';
    },

    resumeTimer() {
        if (!this.state.isPaused) return;
        this.state.isPaused = false;

        (this.state.pausedButtons || []).forEach(b => b.disabled = false);
        this.state.pausedButtons = [];

        const overlay = document.getElementById('pause-overlay');
        if (overlay) overlay.classList.add('hidden');
        const btn = document.getElementById('btn-pause');
        if (btn) btn.innerText = '⏸ JEDA';

        this.state.timerId = setInterval(() => this.timerTick(), 1000);
    },

    submit(side, choice, btn) {
        if (this.state.answered[side] || this.state.isLock) return;
        
        if (choice === this.state.ansLet) {
            this.state.isLock = true;
            this.clearTimer();
            btn.classList.add('correct');
            Sound.correct();
            const winner = side === 'king' ? this.state.king : this.state.queue[0];
            const loser = side === 'king' ? this.state.queue[0] : this.state.king;
            this.state.scores[winner] += 10;
            this.showFeedback(winner, loser, true, side);
        } else {
            this.state.answered[side] = true;
            btn.classList.add('wrong');
            btn.disabled = true;
            Sound.wrong();
            if (this.state.answered.king && this.state.answered.chal) {
                this.clearTimer();
                this.showFeedback(null, null, false);
            }
        }
    },

    showFeedback(winner, loser, isCorrect, side, isTimeout) {
        this.clearTimer();
        const overlay = document.getElementById('result-overlay');
        overlay.classList.remove('hidden');
        let title = "", roast = "";
        
        if (isCorrect) {
            title = side === 'king' ? "RAJA BERTAHAN!" : "TAHTA DIREBUT!";
            const rList = side === 'king' ? this.roasts.kingWins : this.roasts.chalWins;
            roast = rList[Math.floor(Math.random() * rList.length)].replace('${target}', loser);
            if (side === 'chal') Sound.kingChange();
        } else if (isTimeout) {
            title = "WAKTU HABIS!";
            roast = this.roasts.audienceRoast[Math.floor(Math.random() * this.roasts.audienceRoast.length)]
                .replace('${k}', this.state.king).replace('${c}', this.state.queue[0]);
        } else {
            title = "SEMUA SALAH!";
            roast = this.roasts.audienceRoast[Math.floor(Math.random() * this.roasts.audienceRoast.length)]
                .replace('${k}', this.state.king).replace('${c}', this.state.queue[0]);
        }
        
        overlay.innerHTML = `<h1 style="font-size:4rem; font-family:'Cinzel'; color:white;">${title}</h1><div class="roast-text">"${roast}"</div>`;
        
        setTimeout(() => {
            overlay.classList.add('hidden');
            if (isCorrect && side === 'chal') {
                const oldKing = this.state.king;
                this.state.king = this.state.queue.shift();
                this.state.queue.push(oldKing);
            } else {
                this.state.queue.push(this.state.queue.shift());
            }
            
            this.state.duelCount++;
            if (this.state.duelCount >= this.state.queue.length) {
                this.state.duelCount = 0;
                this.state.currentRound++;
            }
            this.loadMatch();
        }, 3500);
    },

    endGame() {
        this.clearTimer();
        Sound.victory();
        this.spawnConfetti();
        const overlay = document.getElementById('result-overlay');
        const sorted = Object.entries(this.state.scores).sort((a,b) => b[1] - a[1]);
        
        const getTitle = (i, s) => {
            if(s === 0) return "TAWANAN ARENA ⛓️";
            if(i === 0) return "KAISAR ARENA 👑"; 
            if(i === 1) return "GLADIATOR ULUNG ⚔️"; 
            if(i === 2) return "PRAJURIT TANGGUH 🛡️"; 
            return "RAKYAT JELATA 📯";
        };

        const getCls = (i) => i===0 ? 'rank-1' : i===1 ? 'rank-2' : i===2 ? 'rank-3' : 'rank-none';
        
        let res = `<h1 class="brand-title" style="font-size:3rem;">HASIL AKHIR</h1>`;
        sorted.forEach(([n, s], i) => {
            res += `<div class="medal-box ${getCls(i)}"><span>${getTitle(i, s)}: ${n}</span><span>${s} PT</span></div>`;
        });
        
        overlay.innerHTML = `
            <div style="overflow-y:auto; width:100%; display:flex; flex-direction:column; align-items:center;">${res}</div>
            <button onclick="location.reload()" class="btn-action" style="width:auto; margin-top:20px;">MAIN LAGI 🏛️</button>
        `;
        overlay.classList.remove('hidden');
    },

    // --- CONFETTI (rekomendasi #3) ---
    spawnConfetti(count = 90) {
        let container = document.getElementById('confetti-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'confetti-container';
            document.body.appendChild(container);
        }
        container.innerHTML = ''; // buang sisa confetti game sebelumnya kalau ada

        const colors = ['#ffcf40', '#ff4d4d', '#27ae60', '#3498db', '#ffffff', '#b8860b'];
        for (let i = 0; i < count; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = (Math.random() * 100) + 'vw';
            piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            piece.style.width = (6 + Math.random() * 6) + 'px';
            piece.style.height = (10 + Math.random() * 8) + 'px';
            piece.style.animationDuration = (2.5 + Math.random() * 2) + 's';
            piece.style.animationDelay = (Math.random() * 1.2) + 's';
            container.appendChild(piece);
        }

        // Bersihkan DOM otomatis setelah animasi selesai biar gak numpuk
        setTimeout(() => { container.innerHTML = ''; }, 5500);
    }
};

// --- GLOBAL HELPERS ---
function getKelasDariURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("kelas");
}

function cekSoalTersedia() {
    let pool = Game.db;
    if (Game.state.kelas) {
        pool = pool.filter(d => String(d.kelas).trim() === String(Game.state.kelas).trim());
    }
    if (Game.state.materi) {
        pool = pool.filter(d => d.materi.toLowerCase().trim() === Game.state.materi.toLowerCase().trim());
    }
    if (Game.state.semester) {
        pool = pool.filter(d => String(d.semester).trim() === String(Game.state.semester).trim());
    }
    return pool.length > 0;
}

function pilihFilter() {
    if (!Game.state.dataLoaded) {
        showAlert("ARENA BELUM SIAP", "Soal masih dimuat dari langit, tunggu sebentar ya...");
        return;
    }

    const materi = document.getElementById('materi-select').value;
    const kelas = document.getElementById('kelas-select').value;
    const semester = document.getElementById('semester-select').value;

    if (!materi || !kelas || !semester) {
        showAlert("PERINTAH TIDAK LENGKAP", "Gladiator harus memilih materi, kelas, dan semester sebelum bertarung!");
        return;
    }

    if (Game.db.length === 0) {
        showAlert("ARENA BELUM SIAP", "Para dewa masih menyiapkan soal...");
        return;
    }

    const pool = Game.db.filter(d => {
        return String(d.kelas).trim() === kelas &&
               String(d.semester).trim() === semester &&
               d.materi.toLowerCase().trim() === materi.toLowerCase();
    });

    if (pool.length === 0) {
        showAlert("TAKDIR MENOLAKMU", `Tidak ada soal untuk ${materi} - Kelas ${kelas} Semester ${semester}`);
        return;
    }

    Game.state.filteredQuestions = pool;
    Game.state.materi = materi;
    Game.state.kelas = kelas;
    Game.state.semester = semester;

    const rondeVal = parseInt(document.getElementById('ronde-select').value, 10);
    Game.state.maxRounds = (!isNaN(rondeVal) && rondeVal > 0) ? rondeVal : 3;
    Game.state.usedQuestions = [];

    Game.switchScreen('screen-input');
}

function masukArenaCek() {
    Game.enterArena();
}

function showAlert(title, message) {
    const overlay = document.getElementById('alert-overlay');
    document.getElementById('alert-title').innerText = title;
    document.getElementById('alert-message').innerText = message;
    overlay.classList.add('show');
}

function closeAlert() {
    document.getElementById('alert-overlay').classList.remove('show');
}

// --- INITIALIZE ---
window.onload = () => {
    Game.playIntro();
    Game.bindFilterListeners();
    const kelas = getKelasDariURL();
    if (kelas) {
        Game.state.kelas = kelas;
        const kelasSelect = document.getElementById('kelas-select');
        if (kelasSelect) kelasSelect.value = kelas;
        console.log("Kelas terpilih dari URL:", kelas);
    }
    Game.loadFromGSS();
};

// Shortcut spasi buat jeda darurat (opsional, gak ganggu tap di TV)
document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    const battleScreen = document.getElementById('screen-battle');
    if (battleScreen && !battleScreen.classList.contains('hidden')) {
        e.preventDefault();
        Game.togglePause();
    }
});

// =====================================================
// TAMBAHAN: LAYAR PENUH (kode di atas tidak diubah)
// =====================================================
const Fullscreen = {
    isActive() {
        return !!(document.fullscreenElement || document.webkitFullscreenElement);
    },

    isSupported() {
        const el = document.documentElement;
        return !!(el.requestFullscreen || el.webkitRequestFullscreen);
    },

    toggle() {
        // lepas fokus tombol supaya tombol Spasi (jeda) tidak ikut menekan tombol ini
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

        if (!this.isSupported()) {
            showAlert("LAYAR PENUH", "Browser ini tidak mendukung layar penuh. Di iPhone: ketuk tombol Bagikan lalu pilih 'Tambah ke Layar Utama', lalu buka dari ikon itu.");
            return;
        }

        try {
            let p;
            if (this.isActive()) {
                const exit = document.exitFullscreen || document.webkitExitFullscreen;
                p = exit.call(document);
            } else {
                const el = document.documentElement;
                const req = el.requestFullscreen || el.webkitRequestFullscreen;
                p = req.call(el);
            }
            if (p && p.catch) p.catch(() => {});
        } catch (e) { /* diblokir browser, abaikan */ }
    },

    sync() {
        const btn = document.getElementById('btn-fullscreen');
        if (!btn) return;
        const on = this.isActive();
        btn.classList.toggle('is-fs', on);
        btn.title = on ? 'Keluar Layar Penuh' : 'Layar Penuh';
    }
};

document.addEventListener('fullscreenchange', () => Fullscreen.sync());
document.addEventListener('webkitfullscreenchange', () => Fullscreen.sync());


// =====================================================
// TAMBAHAN: KOTAK SOAL OTOMATIS MENYESUAIKAN SOAL PANJANG
// (huruf soal & pilihan dikecilkan seperlunya sampai muat di layar)
// =====================================================
const QFit = {
    fit() {
        const screen = document.getElementById('screen-battle');
        const card = document.querySelector('.q-card');
        const q = document.getElementById('q-text');
        const o = document.getElementById('opt-text');
        const first = document.getElementById('progress-wrap');
        const last = document.getElementById('next-up-wrap');
        if (!screen || !card || !q || !o || !first || !last) return;
        if (screen.classList.contains('hidden')) return;

        // kembalikan ke ukuran standar dulu
        q.style.fontSize = ''; o.style.fontSize = ''; card.style.padding = '';
        const cs = getComputedStyle(screen);
        const available = screen.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        const needed = () => last.getBoundingClientRect().bottom - first.getBoundingClientRect().top;
        if (needed() <= available) return;

        const baseQ = parseFloat(getComputedStyle(q).fontSize);
        const baseO = parseFloat(getComputedStyle(o).fontSize);
        const basePad = parseFloat(getComputedStyle(card).paddingTop);
        const minQ = Math.min(baseQ, 12), minO = Math.min(baseO, 11), minPad = Math.min(basePad, 8);

        for (let s = 0.95; s >= 0.2; s -= 0.05) {
            q.style.fontSize = Math.max(minQ, baseQ * s) + 'px';
            o.style.fontSize = Math.max(minO, baseO * s) + 'px';
            card.style.padding = Math.max(minPad, basePad * s) + 'px';
            if (needed() <= available) break;
        }
    }
};

(function () {
    const originalLoadMatch = Game.loadMatch;
    Game.loadMatch = function () {
        const result = originalLoadMatch.apply(this, arguments);
        QFit.fit();
        return result;
    };

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => QFit.fit(), 150);
    });
})();


// =====================================================
// TAMBAHAN: TOMBOL KEMBALI DI SETIAP HALAMAN
// intro -> aturan -> materi -> input nama -> (roulette) -> urutan -> arena
// =====================================================
const Nav = {
    // layar -> layar tujuan saat tombol kembali ditekan
    parents: {
        'screen-rules': 'screen-intro',
        'screen-materi': 'screen-rules',
        'screen-input': 'screen-materi',
        'screen-briefing': 'screen-input',
        'screen-battle': 'screen-input'   // lewat konfirmasi dulu
    },
    current: 'screen-intro',
    pausedByExit: false,

    sync(id) {
        this.current = id;
        const b = document.getElementById('btn-back');
        if (!b) return;
        // roulette (screen-selection) jalan otomatis ±4 detik, jadi tidak ada tombol kembali
        b.classList.toggle('back-hidden', !this.parents[id]);
        b.textContent = id === 'screen-battle' ? '← KELUAR' : '← KEMBALI';
        this.place();
    },

    // di arena, tombol diletakkan di sebelah tombol JEDA supaya tidak bertumpuk
    place() {
        const b = document.getElementById('btn-back');
        const p = document.getElementById('btn-pause');
        if (!b) return;
        if (this.current === 'screen-battle' && p) {
            const r = p.getBoundingClientRect();
            if (r.width > 0) {
                b.style.left = (r.right + 10) + 'px';
                b.style.top = r.top + 'px';
                return;
            }
        }
        b.style.left = '';
        b.style.top = '';
    },

    back() {
        if (this.current === 'screen-battle') { this.askExit(); return; }
        const target = this.parents[this.current];
        if (!target) return;
        if (this.current === 'screen-briefing') this.resetMatch();
        Game.switchScreen(target);
    },

    askExit() {
        // hentikan waktu selama pertanyaan konfirmasi muncul
        const running = !!Game.state.timerId && !Game.state.isPaused;
        if (running) {
            Game.pauseTimer();
            this.pausedByExit = Game.state.isPaused;
        } else {
            this.pausedByExit = false;
        }
        document.getElementById('exit-overlay').classList.add('show');
    },

    stay() {
        document.getElementById('exit-overlay').classList.remove('show');
        if (this.pausedByExit) {
            this.pausedByExit = false;
            Game.resumeTimer();
        }
    },

    leave() {
        document.getElementById('exit-overlay').classList.remove('show');
        this.pausedByExit = false;
        this.resetMatch();
        Game.switchScreen('screen-input');
    },

    // bersihkan sisa pertandingan supaya mulai lagi dari nol (nama di kotak input tetap ada)
    resetMatch() {
        Game.clearTimer();
        const s = Game.state;
        s.isPaused = false;
        s.isLock = false;
        s.pausedButtons = [];
        s.answered = { king: false, chal: false };
        s.currentRound = 1;
        s.duelCount = 0;
        s.king = null;
        s.queue = [];
        s.scores = {};
        s.usedQuestions = [];

        const po = document.getElementById('pause-overlay');
        if (po) po.classList.add('hidden');
        const pb = document.getElementById('btn-pause');
        if (pb) pb.innerText = '⏸ JEDA';
        const ro = document.getElementById('result-overlay');
        if (ro) ro.classList.add('hidden');
        document.querySelectorAll('.pad-btn').forEach(b => {
            b.classList.remove('wrong', 'correct');
            b.disabled = false;
        });
    }
};

(function () {
    const originalSwitchScreen = Game.switchScreen;
    Game.switchScreen = function (id) {
        const result = originalSwitchScreen.apply(this, arguments);
        Nav.sync(id);
        return result;
    };

    const pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn && window.ResizeObserver) {
        new ResizeObserver(() => Nav.place()).observe(pauseBtn);
    }
    window.addEventListener('resize', () => Nav.place());

    // saat konfirmasi keluar tampil, tombol Spasi tidak boleh ikut melanjutkan pertandingan
    document.addEventListener('keydown', (e) => {
        const ov = document.getElementById('exit-overlay');
        if (e.code === 'Space' && ov && ov.classList.contains('show')) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);
})();


// =====================================================
// PERBAIKAN: PEMBACA CSV YANG BENAR
// Sebelumnya baris dipecah dengan split(","), sehingga koma di dalam soal
// merusak kolom. Pembaca ini mengenali sel yang dibungkus tanda kutip
// ("Soal, dengan koma"), tanda kutip ganda ("") di dalam sel, dan baris baru
// di dalam sel.
// =====================================================
function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // buang BOM kalau ada

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inQuotes) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i++; }  // "" -> "
                else inQuotes = false;                            // kutip penutup
            } else {
                field += ch;
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === ',') {
            row.push(field);
            field = "";
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;         // CRLF dihitung satu baris
            row.push(field);
            field = "";
            if (row.some(c => c.trim() !== "")) rows.push(row);   // lewati baris kosong
            row = [];
        } else {
            field += ch;
        }
    }

    // baris terakhir kalau file tidak diakhiri baris baru
    if (field !== "" || row.length > 0) {
        row.push(field);
        if (row.some(c => c.trim() !== "")) rows.push(row);
    }
    return rows;
}


// =====================================================
// TAMBAHAN: MUSIK LATAR (Web Audio API, tanpa file eksternal)
// Kode game di atas tidak diubah, modul ini hanya "menempel" lewat hook.
// Suasana musik mengikuti layar:
//   ambient  -> intro, aturan, pilih materi, input nama, urutan perang
//   roll     -> pengacakan raja (drum roll tegang)
//   battle   -> arena (drum perang; makin tegang saat waktu <= 6 detik)
//   victory  -> hasil akhir (fanfare)
// =====================================================
const Music = {
    mood: null,
    bus: null,
    master: null,
    comp: null,
    step: 0,
    nextTime: 0,
    timer: null,
    started: false,
    ducked: false,
    noiseBuf: null,
    VOL: 0.5,

    mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); },

    // ---------- infrastruktur ----------
    init() {
        const ctx = Sound.getCtx();
        if (this.master) return ctx;
        this.comp = ctx.createDynamicsCompressor();
        this.master = ctx.createGain();
        this.master.gain.value = Sound.enabled ? this.VOL : 0;
        this.master.connect(this.comp);
        this.comp.connect(ctx.destination);

        const len = ctx.sampleRate;
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return ctx;
    },

    start() {
        if (this.started) return;
        try {
            const ctx = this.init();
            if (ctx.state === 'suspended') ctx.resume();
            this.started = true;
            const id = (typeof Nav !== 'undefined' && Nav.current) ? Nav.current : 'screen-intro';
            this.setMood(this.moodForScreen(id), 1.5);
            this.timer = setInterval(() => this.schedule(), 50);
        } catch (e) { /* audio diblokir browser, abaikan */ }
    },

    moodForScreen(id) {
        if (id === 'screen-battle') return 'battle';
        if (id === 'screen-selection') return 'roll';
        return 'ambient';
    },

    setMood(name, fadeIn = 0.6) {
        if (name === this.mood) return;
        this.mood = name;
        if (!this.started) return;
        const ctx = Sound.getCtx();
        const t = ctx.currentTime;

        if (this.bus) {
            const old = this.bus;
            old.gain.cancelScheduledValues(t);
            old.gain.setValueAtTime(old.gain.value, t);
            old.gain.linearRampToValueAtTime(0, t + 0.6);
            setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 1200);
        }
        this.bus = ctx.createGain();
        this.bus.gain.setValueAtTime(0, t);
        this.bus.gain.linearRampToValueAtTime(1, t + fadeIn);
        this.bus.connect(this.master);

        this.step = 0;
        this.nextTime = t + 0.1;
    },

    setMuted(muted) {
        if (!this.master) return;
        const ctx = Sound.getCtx();
        const t = ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(muted ? 0 : (this.ducked ? this.VOL * 0.3 : this.VOL), t + 0.15);
    },

    duck(on) {
        this.ducked = !!on;
        if (!this.master || !Sound.enabled) return;
        const ctx = Sound.getCtx();
        const t = ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setValueAtTime(this.master.gain.value, t);
        this.master.gain.linearRampToValueAtTime(on ? this.VOL * 0.3 : this.VOL, t + 0.3);
    },

    // ---------- penjadwal (lookahead) ----------
    tension() {
        const s = Game.state;
        return this.mood === 'battle' && !!s.timerId && !s.isPaused && !s.isLock && s.timeLeft <= 6;
    },

    bpm() {
        switch (this.mood) {
            case 'ambient': return 66;
            case 'roll':    return 144;
            case 'battle':  return this.tension() ? 156 : 132;
            case 'victory': return 124;
        }
        return 100;
    },

    schedule() {
        if (!this.started || !this.bus || !this.mood) return;
        const ctx = Sound.getCtx();
        if (ctx.state !== 'running') return;
        while (this.nextTime < ctx.currentTime + 0.2) {
            const dur = 60 / this.bpm() / 4; // satu langkah = 1/16 not
            try { this.playStep(this.mood, this.step, this.nextTime, dur); } catch (e) {}
            this.nextTime += dur;
            this.step++;
        }
    },

    // ---------- instrumen ----------
    kick(t, vol = 0.5) {
        const ctx = Sound.getCtx();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(130, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); g.connect(this.bus);
        o.start(t); o.stop(t + 0.32);
    },

    taiko(t, vol = 0.5, pitch = 85) {
        const ctx = Sound.getCtx();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(pitch * 1.8, t);
        o.frequency.exponentialRampToValueAtTime(pitch, t + 0.12);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        o.connect(g); g.connect(this.bus);
        o.start(t); o.stop(t + 0.6);
        this.noise(t, 0.07, 400, 'lowpass', vol * 0.5);
    },

    noise(t, dur, freq, type = 'highpass', vol = 0.15) {
        const ctx = Sound.getCtx();
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = type; f.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        src.connect(f); f.connect(g); g.connect(this.bus);
        src.start(t); src.stop(t + dur + 0.02);
    },

    snare(t, vol = 0.22) { this.noise(t, 0.16, 1500, 'bandpass', vol); },
    hat(t, vol = 0.07)   { this.noise(t, 0.04, 7000, 'highpass', vol); },

    // nada dengan filter (bass / brass)
    voice(t, midi, dur, type, cutoff, vol, attack = 0.01) {
        const ctx = Sound.getCtx();
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = type;
        o.frequency.value = this.mtof(midi);
        f.type = 'lowpass';
        f.frequency.setValueAtTime(cutoff, t);
        f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.4), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(vol, t + attack);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(f); f.connect(g); g.connect(this.bus);
        o.start(t); o.stop(t + dur + 0.05);
    },

    // pad lembut dengan atak dan release panjang
    pad(t, notes, dur, vol = 0.05) {
        const ctx = Sound.getCtx();
        notes.forEach(m => {
            [-6, 6].forEach(det => {
                const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
                o.type = 'sawtooth';
                o.frequency.value = this.mtof(m);
                o.detune.value = det;
                f.type = 'lowpass'; f.frequency.value = 900;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.linearRampToValueAtTime(vol, t + dur * 0.35);
                g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
                o.connect(f); f.connect(g); g.connect(this.bus);
                o.start(t); o.stop(t + dur + 1.3);
            });
        });
    },

    bell(t, midi, vol = 0.07) {
        const ctx = Sound.getCtx();
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = this.mtof(midi);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
        o.connect(g); g.connect(this.bus);
        o.start(t); o.stop(t + 1.7);
    },

    // riser: desis noise yang naik makin tinggi dan keras
    riser(t, dur, vol = 0.14) {
        const ctx = Sound.getCtx();
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf; src.loop = true;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass'; f.Q.value = 3;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(6000, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.95);
        g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
        src.connect(f); f.connect(g); g.connect(this.bus);
        src.start(t); src.stop(t + dur + 0.1);
    },

    // tremolo senar tinggi yang menggigit (dua nada berjarak tritone/semitone)
    tremolo(t, midi, dur, vol = 0.035) {
        const ctx = Sound.getCtx();
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = this.mtof(midi);
        f.type = 'lowpass'; f.frequency.value = 2400;
        g.gain.setValueAtTime(vol, t);
        lfo.frequency.value = 14; lg.gain.value = vol * 0.9;
        lfo.connect(lg); lg.connect(g.gain);
        g.gain.setValueAtTime(vol, t);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(f); f.connect(g); g.connect(this.bus);
        o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },

    // ---------- partitur ----------
    playStep(mood, n, t, dur) {
        const b = n % 16;           // langkah dalam satu bar
        const bar = Math.floor(n / 16);

        if (mood === 'ambient') {
            // Dm | Eb (Phrygian, mencekam) | Dm | A  (tiap akord 2 bar)
            const chords = [[50, 57, 62], [51, 58, 63], [50, 57, 62], [45, 57, 61]];
            const idx = Math.floor(bar / 2) % 4;
            const ch = chords[idx];
            if (n % 32 === 0) this.pad(t, ch, dur * 32, 0.05);
            if (n % 32 === 0) this.voice(t, ch[0] - 24, dur * 31, 'sawtooth', 220, 0.12, 0.6); // gemuruh rendah
            // detak jantung perang
            if (b === 0) this.taiko(t, 0.38, 62);
            if (b === 3) this.taiko(t, 0.24, 62);
            if (b === 8) this.taiko(t, 0.3, 70);
            if (b === 14 && bar % 2 === 1) this.taiko(t, 0.2, 80);
            if (bar % 4 === 3 && b === 0) this.riser(t, dur * 16, 0.07);
            // dentingan dingin pada nada Phrygian
            if ((b === 6 || b === 12) && Math.random() < 0.5) {
                const sc = [74, 75, 77, 79, 81, 82];
                this.bell(t, sc[Math.floor(Math.random() * sc.length)], 0.06);
            }
            return;
        }

        if (mood === 'roll') {
            // drum roll tegang yang terus menanjak
            const climb = Math.min(1, n / 96);
            if (b % 4 === 0) this.kick(t, 0.5);
            this.taiko(t, 0.14 + climb * 0.2, 90 + (b % 4) * 6);
            this.hat(t, 0.05 + climb * 0.04);
            if (b % 4 === 2) this.snare(t, 0.12 + climb * 0.12);
            if (b % 2 === 0) this.voice(t, 38 + (b % 8 === 4 ? 1 : 0), dur * 2, 'sawtooth', 600, 0.14);
            if (n % 32 === 0) {
                this.pad(t, [50, 56, 62], dur * 32, 0.045);
                this.riser(t, dur * 32, 0.12);
            }
            return;
        }

        if (mood === 'battle') {
            const tense = this.tension();
            // Phrygian D: D Eb F G A Bb C  -> akar bergerak D D Eb A
            const roots = [38, 38, 39, 33];
            const root = roots[bar % 4];

            // --- drum perang, lebih padat ---
            if (b === 0 || b === 8 || b === 10) this.kick(t, 0.6);
            if (tense && (b === 3 || b === 6 || b === 12 || b === 14)) this.kick(t, 0.42);
            if (b === 0) this.taiko(t, 0.5, 66);
            if (b === 6 || b === 11) this.taiko(t, 0.34, 88);
            if (b === 4 || b === 12) { this.snare(t, 0.26); this.taiko(t, 0.18, 110); }
            // fill drum tiap 2 bar, penuh di bar ke-4
            if (bar % 2 === 1 && b >= 12) this.taiko(t, 0.3, 75 + (b - 12) * 9);
            if (bar % 4 === 3 && b >= 8 && b % 2 === 0) this.taiko(t, 0.3, 70 + (b - 8) * 6);
            // hi-hat 16 penuh
            this.hat(t, b % 2 === 0 ? 0.07 : 0.045);

            // --- bass 'berlari' 16th (ostinato) ---
            const gallop = [1,0,1,1, 1,0,1,0, 1,0,1,1, 1,1,0,1];
            if (gallop[b]) {
                const accent = (b % 4 === 0);
                this.voice(t, root + 12 + (b === 7 || b === 15 ? 1 : 0), dur * 1.4, 'sawtooth', accent ? 1100 : 650, accent ? 0.13 : 0.09);
            }
            if (b % 8 === 0) this.voice(t, root, dur * 7, 'sine', 250, 0.26, 0.02);

            // --- klakson perang rendah tiap 4 bar ---
            if (bar % 4 === 0 && b === 0) {
                this.voice(t, root + 24, dur * 14, 'sawtooth', 900, 0.07, 0.25);
                this.voice(t, root + 31, dur * 14, 'sawtooth', 900, 0.05, 0.25);
            }

            // --- riff brass staccato, cepat & mencekam ---
            const riff = [
                { 0: 74, 2: 75, 4: 74, 6: 69, 8: 74, 10: 75, 12: 77, 14: 75 },
                { 0: 74, 2: 75, 4: 74, 6: 69, 8: 70, 10: 69, 12: 67, 14: 69 },
                { 0: 75, 2: 77, 4: 75, 6: 70, 8: 75, 10: 77, 12: 79, 14: 77 },
                { 0: 69, 1: 70, 2: 69, 4: 68, 6: 69, 8: 73, 10: 74, 12: 75, 13: 74, 14: 73 }
            ][bar % 4];
            if (riff[b]) this.voice(t, riff[b] + (tense ? 12 * (b % 4 === 0 ? 0 : 0) : 0), dur * 1.6, 'sawtooth', 2600, 0.085, 0.005);
            // lapisan oktaf bawah biar tebal
            if (riff[b] && b % 4 === 0) this.voice(t, riff[b] - 12, dur * 3, 'square', 1200, 0.045, 0.01);

            // --- tremolo senar tinggi bernada mencekam (tritone) ---
            if (b === 0) {
                this.tremolo(t, root + 36, dur * 16, 0.03);
                this.tremolo(t, root + 42, dur * 16, 0.022);
            }

            // --- riser menjelang bar pertama frasa berikutnya ---
            if (bar % 4 === 3 && b === 0) this.riser(t, dur * 16, tense ? 0.2 : 0.14);

            // --- saat waktu hampir habis: sirene dan stab nada tinggi ---
            if (tense) {
                if (b % 4 === 2) this.voice(t, root + 36, dur * 1.2, 'square', 3200, 0.05);
                if (b === 0 || b === 8) this.voice(t, root + 42, dur * 4, 'sawtooth', 3000, 0.045, 0.01);
                if (b % 2 === 1) this.noise(t, 0.03, 9000, 'highpass', 0.05);
            }
            return;
        }

        if (mood === 'victory') {
            // C | G | Am | F  (cocok dengan jingle kemenangan di C mayor)
            const chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
            const roots = [48, 43, 45, 41];
            const ch = chords[bar % 4], root = roots[bar % 4];

            if (b % 4 === 0) this.kick(t, 0.45);
            if (b === 4 || b === 12) this.snare(t, 0.2);
            if (b % 2 === 0) this.hat(t, 0.05);
            if (b % 2 === 0) this.voice(t, root, dur * 1.8, 'sawtooth', 800, 0.1);
            if (b === 0) this.pad(t, ch, dur * 16, 0.04);

            // arpeggio riang
            const arp = [ch[0], ch[1], ch[2], ch[1] + 12];
            if (b % 2 === 0) this.voice(t, arp[(b / 2) % 4] + 12, dur * 2, 'triangle', 3000, 0.1);

            // fanfare di nada tinggi
            if (b === 0) this.voice(t, ch[2] + 12, dur * 6, 'sawtooth', 2600, 0.07, 0.02);
            if (b === 8) this.voice(t, ch[1] + 12, dur * 4, 'sawtooth', 2600, 0.06, 0.02);
            if (b === 12) this.voice(t, ch[2] + 12, dur * 4, 'sawtooth', 2600, 0.06, 0.02);
            return;
        }
    }
};

(function () {
    // 1) Browser baru mengizinkan suara setelah interaksi pertama
    const unlock = () => {
        Music.start();
        const ctx = Sound.ctx;
        if (ctx && ctx.state === 'suspended') ctx.resume();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, unlock, { passive: true })
    );

    // 2) Suasana musik mengikuti layar
    const prevSwitch = Game.switchScreen;
    Game.switchScreen = function (id) {
        const r = prevSwitch.apply(this, arguments);
        Music.setMood(Music.moodForScreen(id));
        return r;
    };
    Music.mood = Music.moodForScreen('screen-intro');

    // 3) Hasil akhir -> fanfare
    const prevEnd = Game.endGame;
    Game.endGame = function () {
        const r = prevEnd.apply(this, arguments);
        Music.setMood('victory', 1.2);
        return r;
    };

    // 4) Jeda -> volume musik mengecil
    const prevPause = Game.pauseTimer;
    Game.pauseTimer = function () {
        const r = prevPause.apply(this, arguments);
        Music.duck(Game.state.isPaused);
        return r;
    };
    const prevResume = Game.resumeTimer;
    Game.resumeTimer = function () {
        const r = prevResume.apply(this, arguments);
        Music.duck(Game.state.isPaused);
        return r;
    };

    // 5) Tombol suara juga mematikan musik
    const prevToggle = Sound.toggle;
    Sound.toggle = function () {
        prevToggle.apply(this, arguments);
        Music.setMuted(!Sound.enabled);
    };

    // 6) Tab disembunyikan -> musik berhenti sementara
    document.addEventListener('visibilitychange', () => {
        const ctx = Sound.ctx;
        if (!ctx || !Music.started) return;
        if (document.hidden) ctx.suspend();
        else ctx.resume();
    });
})();
