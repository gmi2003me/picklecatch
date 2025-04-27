const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Declare constants needed by resizeCanvas BEFORE the first call
// const bottleWidth = 50; // Change to let below
// const bottleHeight = 80; // Change to let below
// Declare bottleY globally BEFORE first resize call, assign value IN resize
let bottleY;

// Declare bottle dimensions globally as let, calculate in resizeCanvas
let bottleWidth;
let bottleHeight;
let bottleX; // Also calculate initial X in resizeCanvas

// Adjust canvas size dynamically
function resizeCanvas() {
    // Make canvas dimensions a multiple of the drawing scale if needed
    const scale = 1; // Example scale factor
    const maxWidth = window.innerWidth * 0.9;
    const maxHeight = window.innerHeight * 0.7; // Reverted to 70% for this specific rollback state

    // Set a base size or aspect ratio
    let canvasWidth = 600;
    let canvasHeight = 600; // The first attempt had 600 here

    // Scale down if necessary
    if (canvasWidth > maxWidth) {
        const ratio = maxWidth / canvasWidth;
        canvasWidth = maxWidth;
        canvasHeight *= ratio;
    }
    if (canvasHeight > maxHeight) {
        const ratio = maxHeight / canvasHeight;
        canvasHeight = maxHeight;
        canvasWidth *= ratio;
    }

    canvas.width = Math.floor(canvasWidth / scale) * scale;
    canvas.height = Math.floor(canvasHeight / scale) * scale;

    // *** Calculate bottle dimensions and position relative to NEW canvas size ***
    bottleWidth = canvas.width * 0.08; // e.g., 8% of canvas width
    bottleHeight = bottleWidth * 1.6; // Maintain aspect ratio (80/50 = 1.6)
    bottleY = canvas.height - bottleHeight - 10; 
    // Calculate initial X position (or maybe keep current X if resizing mid-game?)
    // For simplicity on load/resize, let's center it:
    bottleX = (canvas.width - bottleWidth) / 2;
}

// Initial resize and event listener for window resize
resizeCanvas(); // Run once on load
window.addEventListener('resize', resizeCanvas);


// Game variables
let score = 0;
let gameState = 'welcome'; // States: 'welcome', 'playing', 'gameOver'
let cpuModeActive = false; // Track CPU mode

// Water Bottle - Variables moved up and calculated in resizeCanvas
// let bottleX = (canvas.width - bottleWidth) / 2;

// Pickleball properties
const pickleballRadius = 10;
let pickleballSpeed = 3;
const pickleballs = [];
const initialSpawnInterval = 3000; // Increased Starting interval (3s)
const minSpawnInterval = 1000;     // Increased Minimum interval (1s)
const intervalDecreasePerPoint = 20; // Reduced decrease per point
const spawnIntervalRandomness = 1000; // REVERTED randomness (+/- 2s -> +/- 1s)

let currentRequiredSpawnDelay = initialSpawnInterval; // Time needed before next spawn starts
let lastSpawnTime = 0;

// Pickleball visual details
const pickleballHoleRadius = 2;
const pickleballHolePositions = [
    { x: 0, y: -pickleballRadius * 0.6 },
    { x: pickleballRadius * 0.5, y: pickleballRadius * 0.2 },
    { x: -pickleballRadius * 0.5, y: pickleballRadius * 0.2 },
    { x: 0, y: pickleballRadius * 0.7 }, // Added a 4th hole
];

// Variables for staggered spawning
let pickleballsToSpawnCount = 0;
let nextBurstSpawnTime = 0; // Time for the next spawn in the current burst

// Audio elements - Replaced with Web Audio API
// const popSound = new Audio('pop.mp3');
// const splashSound = new Audio('splash.mp3');
// const doomsdaySound = new Audio('doomsday.mp3');

let audioCtx; // Web Audio API AudioContext

// Function to initialize or resume AudioContext on user interaction
function initAudioContext() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API is not supported in this browser", e);
        }
    } else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// --- Web Audio Sound Synthesis Functions ---

function playPopSound() {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sine'; // A simple, clean tone
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch (A5)
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime); // Start volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1); // Quick fade out

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.1);
}

function playSplashSound() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.2; // 0.2 seconds of noise
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // Fill with white noise
    }

    const noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;

    const gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime); // Start volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15); // Quick fade

    noiseSource.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noiseSource.start(audioCtx.currentTime);
    noiseSource.stop(audioCtx.currentTime + 0.15);
}

function playDoomsdaySound() {
    if (!audioCtx) return;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = 'sawtooth'; // A harsher sound
    oscillator.frequency.setValueAtTime(110, audioCtx.currentTime); // Low pitch (A2)
    oscillator.frequency.exponentialRampToValueAtTime(55, audioCtx.currentTime + 0.4); // Pitch drop

    gainNode.gain.setValueAtTime(0.4, audioCtx.currentTime); // Start volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5); // Slower fade out

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.5);
}

// --- End Sound Functions ---

// --- Drawing Functions ---

function drawCourtBackground() {
    const width = canvas.width;
    const height = canvas.height;
    const courtLineThickness = 8; // Blocky lines
    const kitchenLineY = height * 0.35;

    // Main court color (green)
    ctx.fillStyle = '#32CD32'; // Lime Green
    ctx.fillRect(0, 0, width, height);

    // Court lines (white)
    ctx.fillStyle = 'white';

    // Top boundary
    ctx.fillRect(0, 0, width, courtLineThickness);
    // Bottom boundary (where bottle moves)
    // ctx.fillRect(0, height - courtLineThickness, width, courtLineThickness); // Optional bottom line
    // Left boundary
    ctx.fillRect(0, 0, courtLineThickness, height);
    // Right boundary
    ctx.fillRect(width - courtLineThickness, 0, courtLineThickness, height);

    // Center line (vertical)
    ctx.fillRect(width / 2 - courtLineThickness / 2, 0, courtLineThickness, height);

    // Kitchen Line (Non-volley zone)
    ctx.fillRect(0, kitchenLineY - courtLineThickness / 2, width, courtLineThickness);
}

function drawBottle() {
    // Bottle Body
    ctx.fillStyle = '#42a5f5'; // Lighter Blue for body
    ctx.fillRect(bottleX, bottleY, bottleWidth, bottleHeight);

    // Water inside (semi-transparent)
    const waterLevel = bottleHeight * 0.7; // How full the bottle is
    ctx.fillStyle = 'rgba(66, 165, 245, 0.7)'; // Slightly darker, transparent blue
    ctx.fillRect(bottleX + 5, bottleY + (bottleHeight - waterLevel), bottleWidth - 10, waterLevel - 5);

    // Bottle Cap
    ctx.fillStyle = '#e0e0e0'; // Grey cap
    ctx.fillRect(bottleX + bottleWidth * 0.25, bottleY - 10, bottleWidth * 0.5, 10);
    ctx.fillStyle = '#bdbdbd'; // Darker grey for top ridge
    ctx.fillRect(bottleX + bottleWidth * 0.2, bottleY - 12, bottleWidth * 0.6, 2);

    ctx.textAlign = 'left'; // Reset alignment
}

// Welcome Screen
function drawWelcomeScreen() {
    // Background overlay (optional)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';

    // Title
    ctx.font = '28px "Press Start 2P"';
    ctx.fillText('PickleCatch!', canvas.width / 2, canvas.height / 2 - 80);

    // Instructions
    ctx.font = '12px "Press Start 2P"';
    ctx.fillText('Move mouse to control bottle', canvas.width / 2, canvas.height / 2 - 20);
    ctx.fillText('Catch the pickleballs!', canvas.width / 2, canvas.height / 2 + 10);

    // Start Prompt
    ctx.font = '16px "Press Start 2P"';
    ctx.fillText('Click or tap to start', canvas.width / 2, canvas.height / 2 + 70);

    ctx.textAlign = 'left'; // Reset alignment
}

// New Mouse Controls using Relative Movement
document.addEventListener('mousemove', (evt) => {
    // Only move if playing, not in CPU mode, AND pointer is locked to the canvas
    if (gameState === 'playing' && !cpuModeActive && document.pointerLockElement === canvas) {
        // initAudioContext(); // Might not be needed here if already done on start/lock
        
        bottleX += evt.movementX; // Use relative movement

        // Keep bottle within canvas bounds
        if (bottleX < 0) {
            bottleX = 0;
        }
        if (bottleX + bottleWidth > canvas.width) {
            bottleX = canvas.width - bottleWidth;
        }
    }
});

// Touch controls
function getTouchPos(canvas, evt) {
    const rect = canvas.getBoundingClientRect();
    // Use the first touch point
    const touch = evt.touches[0];
    return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
    };
}

canvas.addEventListener('touchmove', (evt) => {
    evt.preventDefault(); // Prevent scrolling while dragging
    initAudioContext(); // Ensure audio is ready on touch interaction
    const touchPos = getTouchPos(canvas, evt);
    bottleX = touchPos.x - bottleWidth / 2;

    // Keep bottle within canvas bounds
    if (bottleX < 0) {
        bottleX = 0;
    }
    if (bottleX + bottleWidth > canvas.width) {
        bottleX = canvas.width - bottleWidth;
    }
}, { passive: false }); // Need passive: false to allow preventDefault

// Start Game Listener
function startGame() {
    if (gameState === 'welcome') {
        // console.log("startGame called!"); // Remove debug log
        gameState = 'playing';
        lastSpawnTime = performance.now(); 
        initAudioContext(); 
        canvas.removeEventListener('mousedown', startGame);
        canvas.removeEventListener('touchstart', startGame);
        canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
        canvas.requestPointerLock();

        // *** Explicitly call resizeCanvas when game starts *** - REMOVE THIS
        // resizeCanvas(); 
    }
}
canvas.addEventListener('mousedown', startGame);
canvas.addEventListener('touchstart', startGame); // Add touch support for starting

// CPU Mode Key Listeners
window.addEventListener('keydown', (evt) => {
    if (gameState === 'playing' && (evt.key === 'c' || evt.key === 'C')) { // Check for 'c' or 'C'
        cpuModeActive = true;
    }
});

window.addEventListener('keyup', (evt) => {
    if (evt.key === 'c' || evt.key === 'C') {
        cpuModeActive = false;
    }
});

// Pointer Lock Change Listener
document.addEventListener('pointerlockchange', handlePointerLockChange, false);
document.addEventListener('mozpointerlockchange', handlePointerLockChange, false);

function handlePointerLockChange() {
    if (document.pointerLockElement === canvas || document.mozPointerLockElement === canvas) {
        console.log('Pointer Lock active');
        // Optionally add listener for mousemove here instead of globally?
    } else {
        console.log('Pointer Lock released');
        // Pointer was released (e.g., user pressed Esc)
        // Optional: Pause the game or transition state if required
        // if (gameState === 'playing') {
        //     gameState = 'welcome'; // Or maybe a 'paused' state?
        // }
    }
}

// Pickleball functions
function spawnPickleball() {
    const x = Math.random() * (canvas.width - pickleballRadius * 2) + pickleballRadius;
    const y = -pickleballRadius; // Start above the canvas
    const angle = Math.random() * Math.PI * 2; // Random starting angle
    const rotationSpeed = (Math.random() - 0.5) * 0.1; // Random rotation speed/direction
    pickleballs.push({ x, y, angle, rotationSpeed });
    playPopSound();
}

function updatePickleballs() {
    for (let i = pickleballs.length - 1; i >= 0; i--) {
        const pb = pickleballs[i];
        pb.y += pickleballSpeed;
        pb.angle += pb.rotationSpeed; // Update angle for rotation

        // Remove pickleball if it goes off screen (missed)
        if (pb.y - pickleballRadius > canvas.height) {
            pickleballs.splice(i, 1);
            
            // Transition to gameOver state ONCE
            if (gameState === 'playing') { 
                gameState = 'gameOver'; // Change state
                playDoomsdaySound();
                addRestartListener(); // Add listener ONCE when game ends
                // Exit pointer lock when game ends
                document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;
                document.exitPointerLock();
            }
        }

        // Collision detection with bottle
        if (
            pb.x > bottleX &&
            pb.x < bottleX + bottleWidth &&
            pb.y + pickleballRadius > bottleY // Check collision with top of bottle
        ) {
            pickleballs.splice(i, 1); // Remove caught pickleball
            score++;
            playSplashSound();
            // Optional: Increase speed slightly on catch
            pickleballSpeed += 0.05;
        }
    }
}

function drawPickleballs() {
    pickleballs.forEach(pb => {
        // Draw main pickleball body
        ctx.fillStyle = '#9acd32'; // Yellow-green for pickleballs
        ctx.beginPath();
        ctx.arc(pb.x, pb.y, pickleballRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();

        // Draw the rotating holes
        ctx.fillStyle = 'black';
        pickleballHolePositions.forEach(hole => {
            const rotatedX = hole.x * Math.cos(pb.angle) - hole.y * Math.sin(pb.angle);
            const rotatedY = hole.x * Math.sin(pb.angle) + hole.y * Math.cos(pb.angle);
            ctx.beginPath();
            ctx.arc(pb.x + rotatedX, pb.y + rotatedY, pickleballHoleRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.closePath();
        });
    });
}

// Draw score
function drawScore() {
    ctx.fillStyle = 'black';
    ctx.font = '16px "Press Start 2P"'; // Use the 8-bit font
    ctx.fillText('Score: ' + score, 10, 25);
}

// Game Over message
function drawGameOver() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = '24px "Press Start 2P"'; // Use the 8-bit font (larger size)
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 30); // Adjusted spacing
    ctx.font = '14px "Press Start 2P"'; // Use the 8-bit font (smaller size)
    ctx.fillText('Final Score: ' + score, canvas.width / 2, canvas.height / 2 + 10); // Adjusted spacing
    ctx.fillText('Click or tap to play again', canvas.width / 2, canvas.height / 2 + 40); // Changed text
    ctx.textAlign = 'left'; // Reset alignment
}

// Restart Game Logic
function restartGame() {
    // Reset game variables
    score = 0;
    pickleballs.length = 0; // Clear the array
    pickleballSpeed = 3; // Reset speed to initial
    pickleballsToSpawnCount = 0;
    nextBurstSpawnTime = 0;
    // *** SET gameState BACK TO playing ***
    gameState = 'playing'; 
    lastSpawnTime = performance.now(); // Reset spawn timer
    cpuModeActive = false; // Ensure CPU mode is off

    // Remove the restart listener
    removeRestartListener();

    // Request pointer lock again when restarting
    canvas.requestPointerLock = canvas.requestPointerLock || canvas.mozRequestPointerLock;
    canvas.requestPointerLock();
}

function addRestartListener() {
    // Use named functions for easy removal
    canvas.addEventListener('mousedown', handleRestartInput);
    canvas.addEventListener('touchstart', handleRestartInput);
}

function removeRestartListener() {
    canvas.removeEventListener('mousedown', handleRestartInput);
    canvas.removeEventListener('touchstart', handleRestartInput);
}

function handleRestartInput() {
    // *** CHECK gameState INSTEAD OF gameOver ***
    if (gameState === 'gameOver') { 
        initAudioContext(); // Ensure audio is ready for the new game
        restartGame();
    }
}

// Game loop placeholder
function gameLoop(currentTime) { // Pass currentTime for spawn logic

    if (gameState === 'welcome') {
        // Draw background for welcome screen
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawWelcomeScreen();

    } else if (gameState === 'playing') {
        // Draw the court background first
        drawCourtBackground();

        // --- CPU Mode Logic --- (Only runs when playing)
        if (cpuModeActive) {
           // Find the lowest pickleball (highest y value) that's still above the bottle
           let targetPickleball = null;
            let lowestY = -Infinity;

            pickleballs.forEach(pb => {
                if (pb.y < bottleY && pb.y > lowestY) { // Find highest y below bottle line
                    lowestY = pb.y;
                    targetPickleball = pb;
                }
            });

            if (targetPickleball) {
                // Calculate the target X to center the bottle under the ball
                const targetX = targetPickleball.x - bottleWidth / 2;
                
                // Move bottle towards target X (can add smoothing later if desired)
                bottleX = targetX;

                // Clamp bottle position to canvas bounds
                if (bottleX < 0) {
                    bottleX = 0;
                }
                if (bottleX + bottleWidth > canvas.width) {
                    bottleX = canvas.width - bottleWidth;
                }
            } 
        }

        // Draw game elements
        drawBottle();
        drawPickleballs(); 
        drawScore(); 

        // Update game state (pickleballs, collisions)
        updatePickleballs(); // This might change gameState to 'gameOver'

        // --- Spawning Logic --- 
        if (currentTime - lastSpawnTime > currentRequiredSpawnDelay && pickleballsToSpawnCount === 0) { 
            const numToSpawn = Math.floor(score / 10) + 1; 
            pickleballsToSpawnCount = numToSpawn;
            lastSpawnTime = currentTime; 

            // Spawn the first ball of the burst
            if (pickleballsToSpawnCount > 0) {
                spawnPickleball();
                pickleballsToSpawnCount--;
                if (pickleballsToSpawnCount > 0) { 
                    const randomDelay = Math.random() * 800 + 200; // WIDENED delay within burst (0.2s to 1.0s)
                    nextBurstSpawnTime = currentTime + randomDelay;
                }
            }
            
            // Calculate the delay for the NEXT spawn burst
            const baseInterval = Math.max(minSpawnInterval, initialSpawnInterval - score * intervalDecreasePerPoint);
            const randomOffset = (Math.random() - 0.5) * 2 * spawnIntervalRandomness; // Random +/- up to REVERTED spawnIntervalRandomness
            // Clamp the final delay to a minimum value (e.g., 500ms) - REVERTED
            // currentRequiredSpawnDelay = Math.max(500, baseInterval + randomOffset); 
            currentRequiredSpawnDelay = baseInterval + randomOffset;

        }
        // Handle subsequent spawns within the current burst (if any)
        if (pickleballsToSpawnCount > 0 && currentTime >= nextBurstSpawnTime) {
            spawnPickleball();
            pickleballsToSpawnCount--;
            if (pickleballsToSpawnCount > 0) {
                 const randomDelay = Math.random() * 800 + 200; // WIDENED delay within burst (0.2s to 1.0s)
                 nextBurstSpawnTime = currentTime + randomDelay;
            }
        }
        
    } else if (gameState === 'gameOver') {
        // Draw the game over screen
        drawCourtBackground(); // Keep drawing court background
        drawGameOver(); // Draw the overlay
    }

    // Request the next frame ALWAYS
    requestAnimationFrame(gameLoop);
}

// Start the game loop AFTER fonts are ready
document.fonts.ready.then(() => {
  console.log('Fonts loaded, starting game loop.');
  requestAnimationFrame(gameLoop);
});