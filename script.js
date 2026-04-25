// SignSpeak - Real-Time Sign Language Translator
// Google Solution Challenge 2026

// ============= Configuration =============
const CONFIG = {
    minConfidence: 0.7,
    gestureHoldFrames: 15,  // Frames needed to confirm a gesture
    cooldownFrames: 30,     // Frames between detections
    historyLimit: 10
};

// ============= Gesture Definitions =============
// Each gesture is defined by key landmark positions
// Order matters! More specific gestures should be checked first
// Two-handed gestures are checked BEFORE single-handed gestures
const GESTURES = {
    // Two-Handed Gestures (checked first)
    'FIST_BUMP': {
        name: 'Fist Bump / Solidarity',
        description: 'Both fists shown together',
        instruction: '<strong>How to do it:</strong> Make fists with both hands and bring them close together.',
        tip: '💡 Tip: Show both fists to the camera',
        check: checkFistBump,
        twoHanded: true
    },
    'WINNER': {
        name: 'Winner / Victory',
        description: 'Both hands making V sign',
        instruction: '<strong>How to do it:</strong> Extend index and middle fingers on both hands in a V shape.',
        tip: '💡 Tip: Like peace signs with both hands',
        check: checkWinner,
        twoHanded: true
    },
    // Single-Handed Gestures
    'I_LOVE_YOU': {
        name: 'I Love You',
        description: 'I Love You sign (thumb, index, pinky extended)',
        instruction: '<strong>How to do it:</strong> Extend thumb, index, and pinky. Fold middle and ring fingers down.',
        tip: '💡 Tip: Like a "rock on" sign but with thumb out',
        check: checkILoveYou
    },
    'THUMBS_UP': {
        name: 'Yes / Good',
        description: 'Thumbs up gesture',
        instruction: '<strong>How to do it:</strong> Make a fist with your thumb pointing upward.',
        tip: '💡 Tip: Curl your other 4 fingers in',
        check: checkThumbsUp
    },
    'THUMBS_DOWN': {
        name: 'No',
        description: 'Thumbs down gesture',
        instruction: '<strong>How to do it:</strong> Make a fist with your thumb pointing downward.',
        tip: '💡 Tip: Keep other fingers curled in',
        check: checkThumbsDown
    },
    'FIST': {
        name: 'Help',
        description: 'Closed fist',
        instruction: '<strong>How to do it:</strong> Curl all fingers into your palm with thumb wrapped across.',
        tip: '💡 Tip: Make a tight fist, thumb across fingers',
        check: checkFist
    },
    'OPEN_PALM': {
        name: 'Hello',
        description: 'Open hand with all fingers extended',
        instruction: '<strong>How to do it:</strong> Hold your palm open facing the camera, fingers spread apart.',
        tip: '💡 Tip: Keep your fingers straight and visible',
        check: checkOpenPalm
    },
    'PEACE': {
        name: 'Peace / V Sign',
        description: 'Index and middle finger extended in V shape',
        instruction: '<strong>How to do it:</strong> Extend index and middle fingers, fold other fingers down.',
        tip: '💡 Tip: Like a peace sign',
        check: checkPeace
    },
    'OK': {
        name: 'OK / Perfect',
        description: 'Thumb and index forming a circle',
        instruction: '<strong>How to do it:</strong> Touch thumb tip to index tip, extend other fingers.',
        tip: '💡 Tip: Make an "OK" circle with thumb and index',
        check: checkOK
    },
    'ROCK_ON': {
        name: 'Rock On',
        description: 'Index and pinky extended, middle and ring folded',
        instruction: '<strong>How to do it:</strong> Extend index and pinky, fold middle and ring fingers, thumb can be extended or folded.',
        tip: '💡 Tip: Like "I Love You" but without thumb',
        check: checkRockOn
    }
};

// ============= State =============
let state = {
    currentGesture: null,
    gestureFrames: 0,
    lastDetectedGesture: null,
    cooldownCounter: 0,
    isCameraOn: true,
    history: [],
    fps: 0
};

// ============= DOM Elements =============
const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const statusElement = document.getElementById('status');
const fpsElement = document.getElementById('fps');
const gestureTextElement = document.getElementById('gesture-text');
const gestureInstructionElement = document.getElementById('gesture-instruction');
const historyElement = document.getElementById('history');
const speakBtn = document.getElementById('speak-btn');
const clearBtn = document.getElementById('clear-btn');
const cameraBtn = document.getElementById('camera-btn');

// ============= Gesture Detection Functions =============

function isFingerExtended(tipIdx, pipIdx, landmarks) {
    // Check if finger tip is above (lower y) than PIP joint
    // Add small threshold to avoid false positives
    return landmarks[tipIdx].y < landmarks[pipIdx].y - 0.02;
}

function isFingerCurled(tipIdx, pipIdx, landmarks) {
    // Check if finger tip is below (higher y) than PIP joint
    return landmarks[tipIdx].y > landmarks[pipIdx].y;
}

function getThumbState(landmarks) {
    // Thumb: 0=CMC, 1=IP, 2=MCP, 3=IP, 4=TIP
    // Check thumb extension by comparing tip to IP joint and palm base
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const thumbMcp = landmarks[2];
    const wrist = landmarks[0];

    // Calculate distance from thumb tip to wrist
    const thumbToWristDist = Math.sqrt(
        Math.pow(thumbTip.x - wrist.x, 2) + Math.pow(thumbTip.y - wrist.y, 2)
    );

    // Calculate distance from thumb IP to wrist for comparison
    const ipToWristDist = Math.sqrt(
        Math.pow(thumbIp.x - wrist.x, 2) + Math.pow(thumbIp.y - wrist.y, 2)
    );

    // Thumb is extended if tip is farther from wrist than IP joint
    const isExtended = thumbToWristDist > ipToWristDist * 1.2;

    // Check if thumb is pointing up (for thumbs up detection)
    const isPointingUp = thumbTip.y < thumbMcp.y;

    // Check if thumb is pointing down
    const isPointingDown = thumbTip.y > thumbMcp.y + 0.05;

    return { isExtended, isPointingUp, isPointingDown };
}

function checkOpenPalm(landmarks) {
    // All fingers should be extended (tip higher than pip joint)
    const fingerTips = [8, 12, 16, 20];  // Index, Middle, Ring, Pinky tips
    const fingerPips = [6, 10, 14, 18];  // PIP joints

    let extendedFingers = 0;

    for (let i = 0; i < fingerTips.length; i++) {
        if (isFingerExtended(fingerTips[i], fingerPips[i], landmarks)) {
            extendedFingers++;
        }
    }

    // Thumb should be extended (away from palm)
    const thumbState = getThumbState(landmarks);

    return extendedFingers >= 4 && thumbState.isExtended;
}

function checkThumbsUp(landmarks) {
    const thumbState = getThumbState(landmarks);

    // Thumb must be pointing up and extended
    if (!thumbState.isPointingUp || !thumbState.isExtended) {
        return false;
    }

    // Other fingers curled (fingertip below PIP)
    const otherFingersCurled =
        isFingerCurled(8, 6, landmarks) &&   // Index curled
        isFingerCurled(12, 10, landmarks) && // Middle curled
        isFingerCurled(16, 14, landmarks) && // Ring curled
        isFingerCurled(20, 18, landmarks);   // Pinky curled

    return otherFingersCurled;
}

function checkThumbsDown(landmarks) {
    const thumbState = getThumbState(landmarks);

    // Thumb must be pointing down
    if (!thumbState.isPointingDown) {
        return false;
    }

    // Other fingers curled
    const otherFingersCurled =
        isFingerCurled(8, 6, landmarks) &&
        isFingerCurled(12, 10, landmarks) &&
        isFingerCurled(16, 14, landmarks) &&
        isFingerCurled(20, 18, landmarks);

    return otherFingersCurled;
}

function checkILoveYou(landmarks) {
    // ASL "I Love You" - thumb, index, and pinky extended; middle and ring folded
    // Reference: https://en.wikipedia.org/wiki/I_Love_You_sign

    const wrist = landmarks[0];
    const middlePip = landmarks[10];
    const ringPip = landmarks[14];

    // Thumb extended outward (away from palm, not curled in)
    const thumbState = getThumbState(landmarks);
    const thumbExtended = thumbState.isExtended;

    // Index finger extended upward
    const indexExtended = isFingerExtended(8, 6, landmarks);

    // Middle finger folded down (tip below or near PIP)
    const middleFolded = isFingerCurled(12, 10, landmarks);

    // Ring finger folded down
    const ringFolded = isFingerCurled(16, 14, landmarks);

    // Pinky extended outward (tip should be above PIP and away from hand)
    const pinkyExtended = isFingerExtended(20, 18, landmarks);

    // Make sure it's not just an open palm (middle and ring MUST be curled)
    return thumbExtended && indexExtended && middleFolded && ringFolded && pinkyExtended;
}

function checkFist(landmarks) {
    // All fingers curled into fist - check finger tips are below PIP joints
    const indexCurled = isFingerCurled(8, 6, landmarks);
    const middleCurled = isFingerCurled(12, 10, landmarks);
    const ringCurled = isFingerCurled(16, 14, landmarks);
    const pinkyCurled = isFingerCurled(20, 18, landmarks);

    // Thumb curled across palm - check thumb tip is close to palm
    // Use distance from thumb tip to wrist vs thumb MCP to wrist
    const thumbTip = landmarks[4];
    const thumbMcp = landmarks[2];
    const wrist = landmarks[0];

    const thumbTipDist = Math.sqrt(Math.pow(thumbTip.x - wrist.x, 2) + Math.pow(thumbTip.y - wrist.y, 2));
    const thumbMcpDist = Math.sqrt(Math.pow(thumbMcp.x - wrist.x, 2) + Math.pow(thumbMcp.y - wrist.y, 2));

    // Thumb is curled if tip is closer to wrist than MCP joint
    const thumbCurled = thumbTipDist < thumbMcpDist * 1.3;

    // At least 3 fingers curled + thumb
    const fingersCurledCount = [indexCurled, middleCurled, ringCurled, pinkyCurled].filter(Boolean).length;

    return fingersCurledCount >= 3 && thumbCurled;
}

// ============= Two-Handed Gesture Detection Functions =============

function checkHighFive(landmarks1, landmarks2) {
    // Both hands raised with open palms - must be HIGH in the frame
    if (!landmarks1 || !landmarks2) return false;

    // Relaxed open palm check - at least 4 fingers extended
    const isRelaxedOpenPalm = (landmarks) => {
        const fingerTips = [8, 12, 16, 20];
        const fingerPips = [6, 10, 14, 18];
        let extendedCount = 0;
        for (let i = 0; i < fingerTips.length; i++) {
            if (landmarks[fingerTips[i]].y < landmarks[fingerPips[i]].y - 0.01) {
                extendedCount++;
            }
        }
        return extendedCount >= 4;
    };

    const palm1Open = isRelaxedOpenPalm(landmarks1);
    const palm2Open = isRelaxedOpenPalm(landmarks2);

    if (!palm1Open || !palm2Open) return false;

    // Both hands must be in UPPER part of frame (raised high)
    // Lower y value = higher in frame
    const wrist1Y = landmarks1[0].y;
    const wrist2Y = landmarks2[0].y;

    // Require hands to be in top 40% of frame for high five
    return wrist1Y < 0.4 && wrist2Y < 0.4;
}

// Removed: checkClapping, checkHighFive, checkPointing

function checkFistBump(landmarks1, landmarks2) {
    // Both hands making fists, close together
    if (!landmarks1 || !landmarks2) return false;

    // Relaxed fist check - most fingers curled
    const isFist = (landmarks) => {
        const indexCurled = isFingerCurled(8, 6, landmarks);
        const middleCurled = isFingerCurled(12, 10, landmarks);
        const ringCurled = isFingerCurled(16, 14, landmarks);
        const pinkyCurled = isFingerCurled(20, 18, landmarks);
        // At least 3 fingers curled
        return (indexCurled + middleCurled + ringCurled + pinkyCurled) >= 2;
    };

    const fist1 = isFist(landmarks1);
    const fist2 = isFist(landmarks2);

    if (!fist1 || !fist2) return false;

    // Check if fists are close to each other
    const wrist1 = landmarks1[0];
    const wrist2 = landmarks2[0];
    const handDistance = Math.sqrt(
        Math.pow(wrist1.x - wrist2.x, 2) + Math.pow(wrist1.y - wrist2.y, 2)
    );

    return handDistance < 0.45;
}

function checkWinner(landmarks1, landmarks2) {
    // Both hands making V sign (peace sign)
    if (!landmarks1 || !landmarks2) return false;

    const v1 = checkPeace(landmarks1);
    const v2 = checkPeace(landmarks2);

    return v1 && v2;
}

function checkPeace(landmarks) {
    // Index and middle fingers extended, others curled
    const indexExtended = isFingerExtended(8, 6, landmarks);
    const middleExtended = isFingerExtended(12, 10, landmarks);
    const ringCurled = isFingerCurled(16, 14, landmarks);
    const pinkyCurled = isFingerCurled(20, 18, landmarks);

    return indexExtended && middleExtended && ringCurled && pinkyCurled;
}

function checkOK(landmarks) {
    // Thumb and index finger touching, forming a circle
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];

    // Distance between thumb tip and index tip should be small
    const tipDistance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)
    );

    // Other fingers should be extended
    const middleExtended = isFingerExtended(12, 10, landmarks);
    const ringExtended = isFingerExtended(16, 14, landmarks);
    const pinkyExtended = isFingerExtended(20, 18, landmarks);

    return tipDistance < 0.05 && middleExtended && ringExtended && pinkyExtended;
}

function checkRockOn(landmarks) {
    // Index and pinky extended, middle and ring folded
    const indexExtended = isFingerExtended(8, 6, landmarks);
    const middleCurled = isFingerCurled(12, 10, landmarks);
    const ringCurled = isFingerCurled(16, 14, landmarks);
    const pinkyExtended = isFingerExtended(20, 18, landmarks);

    return indexExtended && middleCurled && ringCurled && pinkyExtended;
}

// ============= Main Detection Logic =============

function detectGesture(landmarks1, landmarks2) {
    // Check two-handed gestures FIRST (they need both hands)
    if (landmarks1 && landmarks2) {
        // Calculate hand distance for debugging
        const wrist1 = landmarks1[0];
        const wrist2 = landmarks2[0];
        const handDistance = Math.sqrt(
            Math.pow(wrist1.x - wrist2.x, 2) + Math.pow(wrist1.y - wrist2.y, 2)
        );
        console.log('Hand distance:', handDistance.toFixed(3));

        for (const [gestureKey, gestureData] of Object.entries(GESTURES)) {
            if (gestureData.twoHanded) {
                const isMatch = gestureData.check(landmarks1, landmarks2);
                if (isMatch) {
                    console.log('✓ Two-handed gesture detected:', gestureKey);
                    return gestureKey;
                }
            }
        }
    }

    // Check single-handed gestures (either hand can trigger)
    // BUT: if both hands are present with open palms, don't trigger Hello
    // This prevents High Five hands (lower in frame) from being detected as Hello
    const bothHandsOpen = landmarks1 && landmarks2 &&
                          checkOpenPalm(landmarks1) && checkOpenPalm(landmarks2);

    for (const [gestureKey, gestureData] of Object.entries(GESTURES)) {
        if (gestureData.twoHanded) continue; // Skip two-handed gestures

        // Skip OPEN_PALM (Hello) when both hands are present with open palms
        // This prevents High Five from being confused with Hello
        if (bothHandsOpen && gestureKey === 'OPEN_PALM') {
            continue;
        }

        // Check first hand
        if (landmarks1 && gestureData.check(landmarks1)) {
            console.log('✓ Single-hand gesture detected (hand 1):', gestureKey);
            return gestureKey;
        }

        // Check second hand
        if (landmarks2 && gestureData.check(landmarks2)) {
            console.log('✓ Single-hand gesture detected (hand 2):', gestureKey);
            return gestureKey;
        }
    }

    return null;
}

function updateGestureDetection(landmarks1, landmarks2) {
    const detectedGesture = detectGesture(landmarks1, landmarks2);

    // Cooldown handling
    if (state.cooldownCounter > 0) {
        state.cooldownCounter--;
        return;
    }

    // Same gesture held for enough frames
    if (detectedGesture === state.currentGesture && detectedGesture !== null) {
        state.gestureFrames++;

        if (state.gestureFrames >= CONFIG.gestureHoldFrames) {
            // Confirm gesture detection
            confirmGesture(detectedGesture);
            state.gestureFrames = 0;
            state.cooldownCounter = CONFIG.cooldownFrames;
        }
    } else {
        state.currentGesture = detectedGesture;
        state.gestureFrames = detectedGesture ? 1 : 0;
    }

    // Update display
    if (state.currentGesture) {
        gestureTextElement.textContent = GESTURES[state.currentGesture].name;
        gestureInstructionElement.innerHTML = `
            ${GESTURES[state.currentGesture].instruction}
            <span class="tip">${GESTURES[state.currentGesture].tip}</span>
        `;
    } else {
        gestureTextElement.textContent = '--';
        gestureInstructionElement.innerHTML = 'Show a hand gesture to see instructions';
    }
}

function confirmGesture(gestureKey) {
    const gestureName = GESTURES[gestureKey].name;

    // Add to history
    addToHistory(gestureName);

    // Visual feedback
    gestureTextElement.parentElement.style.animation = 'pulse 0.3s ease';
    setTimeout(() => {
        gestureTextElement.parentElement.style.animation = '';
    }, 300);
}

function addToHistory(gestureName) {
    state.history.unshift({
        gesture: gestureName,
        time: new Date().toLocaleTimeString()
    });

    // Limit history
    if (state.history.length > CONFIG.historyLimit) {
        state.history.pop();
    }

    renderHistory();
}

function renderHistory() {
    historyElement.innerHTML = state.history.map(item => `
        <div class="history-item">
            <span class="gesture">${item.gesture}</span>
            <span class="time">${item.time}</span>
        </div>
    `).join('');
}

// ============= MediaPipe Hands Setup =============

let hands = null;
let camera = null;

function onResults(results) {
    // Update FPS
    state.fps = Math.round(1000 / (performance.now() - (state.lastFrameTime || performance.now())));
    state.lastFrameTime = performance.now();
    fpsElement.textContent = `FPS: ${state.fps}`;

    // Clear canvas
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const handCount = results.multiHandLandmarks.length;
        statusElement.textContent = handCount === 1 ? '🟢 1 Hand Detected' : '🟢 2 Hands Detected';
        statusElement.classList.add('ready');

        // Get landmarks for both hands
        const landmarks1 = results.multiHandLandmarks[0];
        const landmarks2 = results.multiHandLandmarks[1] || null;

        // Draw hand landmarks
        for (const landmarks of results.multiHandLandmarks) {
            // Draw connections
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, {color: '#4285f4', lineWidth: 3});
            // Draw landmarks
            drawLandmarks(canvasCtx, landmarks, {color: '#34a853', lineWidth: 1, radius: 5});
        }

        // Update gesture detection with both hands
        updateGestureDetection(landmarks1, landmarks2);
    } else {
        statusElement.textContent = '🟡 No Hand Detected';
        statusElement.classList.remove('ready');
        gestureTextElement.textContent = '--';
    }

    canvasCtx.restore();
}

function initializeMediaPipe() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: CONFIG.minConfidence,
        minTrackingConfidence: CONFIG.minConfidence
    });

    hands.onResults(onResults);

    // Initialize camera
    camera = new Camera(videoElement, {
        onFrame: async () => {
            await hands.send({image: videoElement});
        },
        width: 640,
        height: 480
    });

    camera.start()
        .then(() => {
            statusElement.textContent = '🟢 Ready - Show your hand!';
            statusElement.classList.add('ready');
        })
        .catch((error) => {
            console.error('Camera error:', error);
            statusElement.textContent = '🔴 Camera Error - Check permissions';
        });
}

// ============= Text-to-Speech =============

function speakCurrentGesture() {
    if (state.history.length === 0) {
        alert('No gestures detected yet! Show me your hand first.');
        return;
    }

    const latestGesture = state.history[0].gesture;

    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(latestGesture);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        speechSynthesis.speak(utterance);
    } else {
        alert('Text-to-speech is not supported in your browser.');
    }
}

// ============= Event Listeners =============

speakBtn.addEventListener('click', speakCurrentGesture);

clearBtn.addEventListener('click', () => {
    state.history = [];
    renderHistory();
    gestureTextElement.textContent = '--';
});

cameraBtn.addEventListener('click', async () => {
    if (state.isCameraOn) {
        // Stop camera
        const stream = videoElement.srcObject;
        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
        }
        videoElement.srcObject = null;
        statusElement.textContent = '⏸️ Camera Off';
        cameraBtn.textContent = '▶️ Start Camera';
    } else {
        // Start camera
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 }
            });
            videoElement.srcObject = stream;
            statusElement.textContent = '🟢 Ready - Show your hand!';
            cameraBtn.textContent = '📷 Toggle Camera';
        } catch (error) {
            statusElement.textContent = '🔴 Camera Error';
            console.error('Camera error:', error);
        }
    }
    state.isCameraOn = !state.isCameraOn;
});

// ============= Canvas Setup =============

function setupCanvas() {
    const rect = videoElement.getBoundingClientRect();
    canvasElement.width = rect.width;
    canvasElement.height = rect.height;
}

// ============= Initialize =============

window.addEventListener('load', () => {
    setupCanvas();
    initializeMediaPipe();

    // Handle window resize
    window.addEventListener('resize', setupCanvas);
});

// ============= Animation for pulse effect =============
const style = document.createElement('style');
style.textContent = `
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
    }
`;
document.head.appendChild(style);
