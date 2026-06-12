/**
 * Procedural ambience: rain hiss + city rumble, generated with WebAudio.
 * Starts on first user gesture (autoplay policy), toggled by the HUD button.
 */
export function createAudio(button) {
  let ctx = null;
  let master = null;
  let running = false;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // --- rain: filtered white noise, two layers ---
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const hiss = ctx.createBufferSource();
    hiss.buffer = noiseBuf; hiss.loop = true;
    const hissBP = ctx.createBiquadFilter();
    hissBP.type = 'bandpass'; hissBP.frequency.value = 2600; hissBP.Q.value = 0.4;
    const hissGain = ctx.createGain(); hissGain.gain.value = 0.5;
    hiss.connect(hissBP).connect(hissGain).connect(master);
    hiss.start();

    const patter = ctx.createBufferSource();
    patter.buffer = noiseBuf; patter.loop = true; patter.playbackRate.value = 0.7;
    const patterLP = ctx.createBiquadFilter();
    patterLP.type = 'lowpass'; patterLP.frequency.value = 900;
    const patterGain = ctx.createGain(); patterGain.gain.value = 0.35;
    patter.connect(patterLP).connect(patterGain).connect(master);
    patter.start();

    // --- city rumble: deep brown-ish noise with slow swell ---
    const rumble = ctx.createBufferSource();
    rumble.buffer = noiseBuf; rumble.loop = true; rumble.playbackRate.value = 0.3;
    const rumbleLP = ctx.createBiquadFilter();
    rumbleLP.type = 'lowpass'; rumbleLP.frequency.value = 90;
    const rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0.8;
    rumble.connect(rumbleLP).connect(rumbleGain).connect(master);
    rumble.start();

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(rumbleGain.gain);
    lfo.start();
  }

  function setOn(on) {
    if (on && !ctx) build();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    running = on;
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(on ? 0.16 : 0, t + 1.2);
    button.textContent = on ? '◉ SOUND ON' : '○ SOUND OFF';
    button.classList.toggle('on', on);
  }

  button.addEventListener('click', () => setOn(!running));
  return { setOn };
}
