# Audio Notes

Current MVP uses procedural audio generated with Web Audio API in `audio-provider.tsx`.
The target direction is contemplative and spatial: soft drones, restrained pulses, and clean UI cues.
No track, motif, or melodic phrase should copy any existing score.

To replace with authored assets later:
1. Keep the `AudioProvider` API stable (`playEffect`, `updateSettings`, `unlockAudio`).
2. Replace oscillator-based effect generation in `playEffect` with decoded audio buffers.
3. Replace ambient oscillator logic in `startAmbient` with looped ambient track playback.
4. Keep reduced sensory mode behavior unchanged (must mute or significantly reduce stimulation).
