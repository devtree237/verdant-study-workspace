import { describe, expect, it } from 'vitest';
import { appendTranscript, collectSpeechResults, encodeMonoWav, googleTranscript } from './speech';

describe('task dictation text integrity', () => {
  it('appends finalized words to the latest typed title without replacing edits or repeating whitespace', () => {
    expect(appendTranscript('Revise physics tomorrow', '  and solve\nquestions  ')).toBe('Revise physics tomorrow and solve questions');
    expect(appendTranscript('Revise ', 'physics')).toBe('Revise physics');
    expect(appendTranscript('Read this', ', then practice')).toBe('Read this, then practice');
    expect(appendTranscript('अध्याय पढ़ना', 'और प्रश्न हल करना')).toBe('अध्याय पढ़ना और प्रश्न हल करना');
    expect(appendTranscript('Keep my exact text  ', '   ')).toBe('Keep my exact text  ');
  });
  it('commits each final browser result once while replacing interim previews and allowing repeated spoken words', () => {
    const committed = new Set<number>();
    expect(collectSpeechResults([{ isFinal: false, 0: { transcript: 'rev' } }], committed)).toEqual({ finalText: '', interimText: 'rev' });
    expect(collectSpeechResults([{ isFinal: false, 0: { transcript: 'revise physics' } }], committed)).toEqual({ finalText: '', interimText: 'revise physics' });
    const first = { isFinal: true, 0: { transcript: 'Revise physics' } };
    expect(collectSpeechResults([first], committed)).toEqual({ finalText: 'Revise physics', interimText: '' });
    expect(collectSpeechResults([first], committed)).toEqual({ finalText: '', interimText: '' });
    expect(collectSpeechResults([first, { isFinal: true, 0: { transcript: 'Revise physics' } }], committed)).toEqual({ finalText: 'Revise physics', interimText: '' });
  });
  it('reads only actual top Google alternatives and returns no invented text for silence', () => {
    expect(googleTranscript({ results: [{ alternatives: [{ transcript: 'Revise physics' }, { transcript: 'Unused alternative' }] }, { alternatives: [{ transcript: 'tomorrow' }] }] })).toBe('Revise physics tomorrow');
    expect(googleTranscript({ results: [] })).toBe('');
    expect(googleTranscript({})).toBe('');
    expect(() => googleTranscript({ results: [{ alternatives: [] }] })).toThrow('invalid transcript');
    expect(() => googleTranscript({ results: 'not an array' })).toThrow('invalid speech response');
  });
});

describe('Google microphone audio encoding', () => {
  it('produces mono PCM16 WAV with matching sample rate, byte counts and clipped signed samples', () => {
    const output = encodeMonoWav(new Float32Array([-2, -1, 0, .5, 1, 2, NaN]), 16000), data = new DataView(output);
    const name = (offset: number, length: number) => String.fromCharCode(...new Uint8Array(output, offset, length));
    expect(name(0, 4)).toBe('RIFF'); expect(name(8, 4)).toBe('WAVE'); expect(name(36, 4)).toBe('data');
    expect(data.getUint32(4, true)).toBe(output.byteLength - 8);
    expect(data.getUint16(20, true)).toBe(1); expect(data.getUint16(22, true)).toBe(1);
    expect(data.getUint32(24, true)).toBe(16000); expect(data.getUint32(28, true)).toBe(32000);
    expect(data.getUint16(34, true)).toBe(16); expect(data.getUint32(40, true)).toBe(14);
    expect(Array.from({ length: 7 }, (_, index) => data.getInt16(44 + index * 2, true))).toEqual([-32768, -32768, 0, 16384, 32767, 32767, 0]);
  });
  it('rejects unsupported rates, empty audio and recordings beyond the synchronous endpoint limit', () => {
    expect(() => encodeMonoWav(new Float32Array(1), 96000)).toThrow('sample rate');
    expect(() => encodeMonoWav(new Float32Array(), 16000)).toThrow('60 seconds');
    expect(() => encodeMonoWav(new Float32Array(16000 * 60 + 1), 16000)).toThrow('60 seconds');
  });
});
