// Configuración del Worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const pageInfo = document.getElementById('page-info');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const ttsBtn = document.getElementById('tts-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const birdSoundBtn = document.getElementById('bird-sound-btn');

// Variables de estado
let pageFlip = null;
let pagesText = []; // Guarda el texto de cada página para lectura en voz alta
let currentScale = 1.0;
const SCALE_STEP = 0.15;
const MAX_SCALE = 1.8;
const MIN_SCALE = 0.8;

// Estado de sonido de pájaros
let birdSoundActive = false;
let audioCtx = null;
let birdInterval = null;

// 1. Cargar automáticamente el cuento.pdf alojado en el repositorio
document.addEventListener('DOMContentLoaded', () => {
    loadPDF('cuento.pdf');
});

async function loadPDF(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pagesText = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const totalPages = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        // Bucle para procesar cada página
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Extraer texto plano para la lectura en voz alta
            const textContent = await page.getTextContent();
            const textString = textContent.items.map(item => item.str).join(' ');
            pagesText.push(textString);

            // Renderizar la página visual en canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        // Inicializar Flipbook
        bookContainer.style.display = 'block';
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 315,
            maxWidth: pageWidth,
            minHeight: 420,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.4,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Evento al pasar de página
        pageFlip.on('flip', () => {
            updatePageInfo();
            stopSpeech(); // Detener la lectura actual al girar la hoja
            if (birdSoundActive) {
                playBirdChirp(); // Un gorjeo especial al pasar de hoja
            }
        });

        updatePageInfo();
        loading.style.display = 'none';

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'No se pudo encontrar "cuento.pdf". Asegúrate de que el archivo esté guardado con ese nombre en tu repositorio.';
    }
}

// Actualizar el número de página activa
function updatePageInfo() {
    if (!pageFlip) return;
    const current = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageInfo.innerText = `Página ${current} de ${total}`;
}

// --- 4. Navegación con Botones en Forma de Corazón ---
prevBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

nextBtn.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

// --- 3. Controles de Zoom para Alumnos con Baja Visión ---
zoomInBtn.addEventListener('click', () => {
    if (currentScale < MAX_SCALE) {
        currentScale += SCALE_STEP;
        applyZoom();
    }
});

zoomOutBtn.addEventListener('click', () => {
    if (currentScale > MIN_SCALE) {
        currentScale -= SCALE_STEP;
        applyZoom();
    }
});

zoomResetBtn.addEventListener('click', () => {
    currentScale = 1.0;
    applyZoom();
});

function applyZoom() {
    bookContainer.style.transform = `scale(${currentScale})`;
}

// --- 3. Lectura en Voz Alta (Text-to-Speech en Español) ---
ttsBtn.addEventListener('click', () => {
    if (!('speechSynthesis' in window)) {
        alert('Tu navegador no cuenta con la función de lectura en voz alta.');
        return;
    }

    if (window.speechSynthesis.speaking) {
        stopSpeech();
    } else {
        readCurrentPage();
    }
});

function readCurrentPage() {
    if (!pageFlip || pagesText.length === 0) return;

    const pageIndex = pageFlip.getCurrentPageIndex();
    let textToRead = pagesText[pageIndex] || '';

    // Si el libro está desplegado en doble página, incluir el texto de la página contigua
    if (pageFlip.getOrientation() === 'landscape' && pageIndex + 1 < pagesText.length && pageIndex > 0) {
        if (pagesText[pageIndex + 1]) {
            textToRead += ' ' + pagesText[pageIndex + 1];
        }
    }

    if (!textToRead.trim()) {
        textToRead = "Página sin texto detectable.";
    }

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES'; // Configurado en español
    utterance.rate = 0.85; // Velocidad pausada idónea para niños / baja visión

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    utterance.onstart = () => {
        ttsBtn.innerHTML = '⏹️ Detener lectura';
        ttsBtn.classList.add('speaking');
    };

    utterance.onend = resetTtsButton;
    utterance.onerror = resetTtsButton;

    window.speechSynthesis.speak(utterance);
}

function stopSpeech() {
    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
    }
    resetTtsButton();
}

function resetTtsButton() {
    ttsBtn.innerHTML = '🔊 Leer en voz alta';
    ttsBtn.classList.remove('speaking');
}

// --- 6. Sonidos de Naturaleza / Canto de Pájaros (Web Audio API) ---
birdSoundBtn.addEventListener('click', () => {
    birdSoundActive = !birdSoundActive;

    if (birdSoundActive) {
        birdSoundBtn.innerText = '🐤 Pájaros: ON';
        birdSoundBtn.classList.add('active');
        startBirdAmbience();
    } else {
        birdSoundBtn.innerText = '🐤 Pájaros: OFF';
        birdSoundBtn.classList.remove('active');
        stopBirdAmbience();
    }
});

function initAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function startBirdAmbience() {
    initAudioContext();
    playBirdChirp();
    
    // Generar trinos suaves a intervalos aleatorios (cada 2.5 a 4.5 segundos)
    birdInterval = setInterval(() => {
        if (birdSoundActive) {
            playBirdChirp();
        }
    }, 3000);
}

function stopBirdAmbience() {
    if (birdInterval) {
        clearInterval(birdInterval);
        birdInterval = null;
    }
}

// Síntesis acústica de trinos de pájaro
function playBirdChirp() {
    if (!audioCtx) return;

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    
    // Modulación de frecuencia típica de un ave silvestre
    const baseFreq = 2000 + Math.random() * 800;
    const peakFreq = baseFreq + 800 + Math.random() * 400;

    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(peakFreq, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.16);

    // Envolvente de volumen suave
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
}