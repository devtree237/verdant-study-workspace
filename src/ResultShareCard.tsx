import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Copy, Download, Share2 } from 'lucide-react';
import { StudyIllustration } from './StudyIllustration';
import type { TestAnalysis, TestAttempt } from './testing-model';
import './result-share-card.css';

const cardWidth = 360;
const scorePreference = 'verdant.share-card.show-scores';
const cardFont = 'system-ui, sans-serif';
const marks = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

function fitText(context: CanvasRenderingContext2D | null, value: string, width: number, size: number, weight: number) {
  const line = value.replace(/\s+/g, ' ').trim();
  if (!context) return line;
  context.font = `${weight} ${size}px ${cardFont}`;
  if (context.measureText(line).width <= width) return line;

  const characters = Array.from(line);
  let end = characters.length;
  while (end > 0 && context.measureText(`${characters.slice(0, end).join('')}…`).width > width) end--;
  return `${characters.slice(0, end).join('').trimEnd()}…`;
}

async function rasterizeCard(vector: Blob, height: number): Promise<Blob> {
  const url = URL.createObjectURL(vector);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    // Cap the raster dimensions for unusually long papers with many subject groups.
    const scale = Math.min(3, 8192 / height);
    canvas.width = Math.round(cardWidth * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create the PNG')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function downloadImage(file: File) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

type Props = {
  attempt: TestAttempt;
  analysis: TestAnalysis;
  notify: (message: string) => void;
};

export function ResultShareCard({ attempt, analysis, notify }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const labelId = useId();
  const descriptionId = useId();
  const clipId = useId();
  const [showScores, setShowScores] = useState(() => {
    try {
      return localStorage.getItem(scorePreference) !== 'false';
    } catch {
      return true;
    }
  });
  const [prepared, setPrepared] = useState<{ key: object; file: File }>();
  const [sharing, setSharing] = useState(false);
  const height = Math.max(584, 525 + (showScores ? analysis.subjects.length * 32 : 0));
  const finished = attempt.submittedAt ?? attempt.deadlineAt;
  const date = new Date(finished).toLocaleDateString(undefined, { dateStyle: 'long' });
  const title = attempt.paper.title;
  const filename = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80).replace(/^-|-$/g, '') || 'verdant'}-result`;

  const artwork = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d');
    const score = marks.format(analysis.score);
    const maximum = ` / ${marks.format(analysis.maxScore)}`;
    let scoreScale = 1;
    if (context) {
      context.font = `750 58px ${cardFont}`;
      const scoreWidth = context.measureText(score).width;
      context.font = `750 24px ${cardFont}`;
      scoreScale = Math.min(1, 308 / (scoreWidth + context.measureText(maximum).width));
    }
    const subjects = showScores ? analysis.subjects.map(subject => ({
      name: subject.name,
      label: fitText(context, subject.name, 149, 13, 600),
      score: `${marks.format(subject.score)} / ${marks.format(subject.maxScore)}`,
    })) : [];
    return {
      title: fitText(context, title, 308, 16, 650),
      score,
      maximum,
      date,
      subjects,
      scoreSize: 58 * scoreScale,
      maximumSize: 24 * scoreScale,
    };
  }, [analysis, date, showScores, title]);

  useEffect(() => {
    if (!svg.current) return;
    let disposed = false;
    const source = new XMLSerializer().serializeToString(svg.current);
    const vector = new Blob([source], { type: 'image/svg+xml' });
    async function prepareImage() {
      let file: File;
      try {
        const png = await rasterizeCard(vector, height);
        file = new File([png], `${filename}.png`, { type: 'image/png' });
      } catch {
        file = new File([vector], `${filename}.svg`, { type: 'image/svg+xml' });
      }
      if (!disposed) setPrepared({ key: artwork, file });
    }
    void prepareImage();
    return () => { disposed = true; };
  }, [artwork, filename, height]);

  const file = prepared?.key === artwork ? prepared.file : undefined;
  const shareData = file ? { files: [file], title: `${title} · Verdant` } : undefined;
  const nativeShare = Boolean(shareData && typeof navigator.share === 'function' && navigator.canShare?.(shareData));
  const copyImage = file?.type === 'image/png' && typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';

  function changeVisibility(visible: boolean) {
    setShowScores(visible);
    try {
      localStorage.setItem(scorePreference, String(visible));
    } catch {
      // The current card still respects the switch when storage is unavailable.
    }
  }

  async function shareImage() {
    if (!file || sharing) return;
    setSharing(true);
    try {
      if (nativeShare && shareData) {
        await navigator.share(shareData);
      } else if (copyImage) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': file })]);
        notify('Image copied. Paste it into a message or post.');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        downloadImage(file);
        notify('Image downloaded. Attach it when you share.');
      }
    } finally {
      setSharing(false);
    }
  }

  const scoresHeight = artwork.subjects.length ? 36 + artwork.subjects.length * 32 : 0;
  const artTop = Math.max(262, 239 + scoresHeight);
  const shareLabel = nativeShare ? 'Share image' : 'Copy image';
  const ShareIcon = nativeShare || !file ? Share2 : Copy;

  return (
    <section className="result-share" aria-label="Share card">
      <figure className="result-share-preview">
        <svg ref={svg} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${cardWidth} ${height}`}
          width={cardWidth} height={height} fontFamily={cardFont} fill="#0e203e" role="img"
          aria-labelledby={labelId} aria-describedby={descriptionId}>
          <title id={labelId}>{title} · Verdant result card</title>
          <desc id={descriptionId}>{showScores ? `Score ${artwork.score}${artwork.maximum}. ${artwork.subjects.map(subject => `${subject.name}: ${subject.score}.`).join(' ')}` : 'Practice complete. Scores are hidden.'}</desc>
          <defs><clipPath id={clipId}><rect width={cardWidth} height={height} rx="25"/></clipPath></defs>
          <g clipPath={`url(#${clipId})`}>
            <rect width={cardWidth} height={height} fill="#ebe9ff"/>
            <circle cx="346" cy="33" r="146" fill="#ddf5ee"/>
            <circle cx="-18" cy={height - 164} r="111" fill="#fff2d7"/>

            <text x="26" y="47" fontSize="19" fontWeight="750">verdant<tspan fill="#1e3fd8">.</tspan></text>
            <rect x="233" y="27" width="101" height="25" rx="12.5" fill="#fff"/>
            <text x="283.5" y="43.5" textAnchor="middle" fill="#1835b8" fontSize="10" fontWeight="750" letterSpacing=".8">TEST RESULT</text>
            <text x="26" y="91" fill="#19314e" fontSize="16" fontWeight="650"><title>{title}</title>{artwork.title}</text>

            {showScores ? (
              <text x="26" y="163" fontWeight="750">
                <tspan fontSize={artwork.scoreSize}>{artwork.score}</tspan>
                <tspan fontSize={artwork.maximumSize} fill="#42537a">{artwork.maximum}</tspan>
              </text>
            ) : <text x="26" y="151" fontSize="31" fontWeight="750">Practice complete</text>}

            {artwork.subjects.length > 0 && (
              <g transform="translate(26 193)">
                <rect width="308" height={scoresHeight} rx="15" fill="#fff"/>
                <text x="15" y="22" fontSize="10" fontWeight="750" fill="#4f627b" letterSpacing="1">SUBJECT SCORES</text>
                {artwork.subjects.map((subject, index) => (
                  <g key={subject.name} transform={`translate(15 ${30 + index * 32})`}>
                    <title>{subject.name} · {subject.score}</title>
                    {index > 0 && <path d="M0 0h278" stroke="#e5e9f4"/>}
                    <circle cx="3" cy="16" r="3" fill="#4d73e5"/>
                    <text x="13" y="21" fontSize="13" fontWeight="600">{subject.label}</text>
                    <text x="278" y="21" fontSize="13" fontWeight="700" textAnchor="end">{subject.score}</text>
                  </g>
                ))}
              </g>
            )}

            <g className="result-share-art" transform={`translate(80 ${artTop})`}>
              <style>{`
                .result-share-art .study-illustration { color: #162b4d; }
                .result-share-art .art-paper { fill: #f6f8ff; }
                .result-share-art .art-sky { fill: #a5d8ff; }
                .result-share-art .art-cyan { fill: #6ed9bb; }
                .result-share-art .art-cobalt { fill: #6b83ed; }
                .result-share-art .art-shadow { fill: #d9dbf5; }
              `}</style>
              <StudyIllustration variant="notebook" size={200}/>
            </g>
            <text x="180" y={artTop + 155} textAnchor="middle" fontSize="16" fontWeight="700">One practice at a time.</text>

            <rect x="26" y={height - 78} width="308" height="52" rx="13" fill="#fff"/>
            <text x="41" y={height - 56} fontSize="12" fontWeight="750">Verdant Study Workspace</text>
            <text x="41" y={height - 40} fontSize="11" fill="#4f627b">{artwork.date}</text>
          </g>
        </svg>
      </figure>

      <div className="result-share-controls">
        <label className="result-share-toggle">
          <input type="checkbox" role="switch" checked={showScores} disabled={sharing} onChange={event => changeVisibility(event.target.checked)}/>
          <span>Show my scores on the card</span>
        </label>
        <div className="result-share-buttons" aria-busy={!file}>
          {(nativeShare || copyImage || !file) && (
            <button type="button" className="result-share-primary" disabled={!file || sharing} onClick={() => void shareImage()}>
              <ShareIcon size={17} aria-hidden="true"/> {file ? shareLabel : 'Preparing image…'}
            </button>
          )}
          <button type="button" className="result-share-download" disabled={!file || sharing} onClick={() => file && downloadImage(file)}>
            <Download size={17} aria-hidden="true"/> Download image
          </button>
        </div>
        <p>Choose whether to include your total and subject scores in the shared image.</p>
      </div>
    </section>
  );
}
