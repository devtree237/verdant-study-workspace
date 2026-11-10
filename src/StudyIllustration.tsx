import './study-illustration.css';

function Sparkle({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <path className="art-paper" transform={`translate(${x} ${y}) scale(${scale})`} d="M0-7C1-3 3-1 7 0 3 1 1 3 0 7-1 3-3 1-7 0-3-1-1-3 0-7Z" />;
}

function Sprig({ transform }: { transform: string }) {
  return <g transform={transform}>
    <path d="M0 0C0-17 7-32 19-45" />
    <path className="art-sky" d="M4-19C-7-20-15-25-16-35-5-34 1-29 4-19Z" />
    <path className="art-cyan" d="M9-29C20-29 27-35 29-44 18-43 12-38 9-29Z" />
    <path className="art-sky" d="M16-41C12-50 16-59 24-64 27-54 23-47 16-41Z" />
  </g>;
}

function Book() {
  return <>
    <path className="art-cobalt" d="M33 63c22-6 43-3 57 8 14-11 35-14 57-8l12 32c-24-5-49-2-69 11-20-13-45-16-69-11Z" />
    <path className="art-paper" d="M36 58c22-7 39-2 54 9 15-11 32-16 54-9l10 30c-22-3-46 1-64 14-18-13-42-17-64-14Z" />
    <path d="M90 68v33m-49-34c13-2 26 1 38 7m-42 0c14-1 26 2 42 8m-46-1c14 0 26 3 40 9m28-16c12-6 25-9 38-7m-38 15c16-6 28-9 42-8m-36 16c14-6 26-9 40-9" />
  </>;
}

function Notebook() {
  return <>
    <Sprig transform="translate(119 69) scale(.9)" />
    <Book />
    <Sparkle x={47} y={35} />
    <Sparkle x={73} y={46} scale={.56} />
  </>;
}

function Growth() {
  return <>
    <path className="art-sky" d="M28 91h78v13H28a6.5 6.5 0 0 1 0-13Z" />
    <path className="art-paper" d="M35 94h71v7H35a3.5 3.5 0 0 1 0-7Z" />
    <path className="art-cobalt" d="M38 77h72v14H38a7 7 0 0 1 0-14Z" />
    <path className="art-paper" d="M44 80h66v8H44a4 4 0 0 1 0-8Z" />
    <path className="art-sky" d="M44 65h58v12H44a6 6 0 0 1 0-12Z" />
    <path className="art-paper" d="M49 68h53v6H49a3 3 0 0 1 0-6Z" />
    <Sprig transform="translate(122 73) scale(.92)" />
    <path className="art-cyan" d="M108 77h40l-5 23a5 5 0 0 1-5 4h-20a5 5 0 0 1-5-4Z" />
    <rect className="art-paper" x="105" y="70" width="46" height="9" rx="4" />
    <path d="M124 88q3-4 6 0m-7 5h8" />
    <Sparkle x={61} y={39} />
    <Sparkle x={88} y={49} scale={.55} />
  </>;
}

function Tasks() {
  return <>
    <rect className="art-sky" x="48" y="23" width="67" height="81" rx="8" transform="rotate(-12 81 63)" />
    <rect className="art-paper" x="56" y="21" width="67" height="85" rx="8" transform="rotate(6 89 64)" />
    <path d="M73 39h31m-30 5h18" />
    <path className="art-sky" d="M70 53h9v9h-9Zm0 16h9v9h-9Zm0 16h9v9h-9Z" />
    <path d="m71 56 3 3 6-7m4 7h22m-22 15h22m-22 16h15" />
    <path className="art-cyan" d="m110 91 27-35 8 6-27 35-11 5Z" />
    <path className="art-paper" d="m110 91 8 6-11 5Z" />
    <path d="m133 61 8 6" />
    <Sparkle x={38} y={37} />
    <Sparkle x={143} y={34} scale={.6} />
  </>;
}

function Test() {
  return <>
    <rect className="art-cobalt" x="43" y="26" width="71" height="81" rx="9" transform="rotate(-8 78 67)" />
    <rect className="art-paper" x="49" y="23" width="67" height="80" rx="8" />
    <path className="art-sky" d="M69 18h5a8 8 0 0 1 16 0h5v12H69Z" />
    <path d="M62 45h36m-36 6h25" />
    <circle className="art-cyan" cx="65" cy="65" r="4" />
    <circle cx="65" cy="78" r="4" />
    <circle cx="65" cy="91" r="4" />
    <path d="M75 65h26M75 78h26M75 91h16" />
    <circle className="art-sky" cx="128" cy="85" r="21" />
    <circle className="art-paper" cx="128" cy="85" r="15.5" />
    <path d="M128 75v10l6 4m-6-29v4m-5-5h10" />
    <Sparkle x={134} y={35} />
    <Sparkle x={34} y={54} scale={.55} />
  </>;
}

function Mistakes() {
  return <>
    <rect className="art-sky" x="48" y="27" width="70" height="78" rx="8" transform="rotate(-11 83 66)" />
    <path className="art-paper" d="M60 25h50l14 14v58a8 8 0 0 1-8 8H60a8 8 0 0 1-8-8V33a8 8 0 0 1 8-8Z" />
    <path className="art-sky" d="M110 25v14h14Z" />
    <path d="M64 47h35m-35 8h28m-28 33h36m-36 7h24" />
    <path className="art-sky" d="M62 63h39v15H62Z" />
    <path d="M67 71h27m-20-3 5 6 8-9" />
    <path className="art-cyan" d="m133 86 17 13a4 4 0 0 1-5 7l-17-13Z" />
    <circle className="art-sky" cx="119" cy="75" r="21" />
    <circle className="art-paper" cx="119" cy="75" r="16" />
    <path d="m111 74 6 6 10-12" />
    <Sparkle x={33} y={43} scale={.73} />
    <Sparkle x={143} y={45} />
  </>;
}

function Materials() {
  return <>
    <path className="art-cobalt" d="M34 51a7 7 0 0 1 7-7h28l9 9h62a7 7 0 0 1 7 7v34a9 9 0 0 1-9 9H43a9 9 0 0 1-9-9Z" />
    <rect className="art-sky" x="57" y="24" width="49" height="62" rx="5" transform="rotate(-11 81 55)" />
    <path className="art-paper" d="M75 22h37l15 15v48H75Z" transform="rotate(8 101 54)" />
    <path d="m116 24-2 14 14 2M86 42l17 2m-18 5 28 4m-29 3 26 4" />
    <path className="art-cyan" d="M36 63h110a6 6 0 0 1 6 8l-7 26a8 8 0 0 1-8 6H44a8 8 0 0 1-8-6l-6-26a6 6 0 0 1 6-8Z" />
    <rect className="art-paper" x="69" y="75" width="44" height="16" rx="5" />
    <path d="M79 83h24" />
    <Sparkle x={148} y={32} />
    <Sparkle x={37} y={29} scale={.59} />
  </>;
}

function Focus() {
  return <>
    <path className="art-cobalt" d="m58 91-10 13m70-13 10 13" strokeWidth="4" />
    <Sprig transform="translate(119 87) scale(.72)" />
    <circle className="art-cyan" cx="84" cy="66" r="38" />
    <circle className="art-paper" cx="84" cy="66" r="31" />
    <path className="art-sky" d="M56 41 45 34a14 14 0 0 1 21-12Zm56 0 11-7a14 14 0 0 0-21-12Z" />
    <path d="M84 39v4m0 46v4M57 66h4m46 0h4M84 48v18l13 8" />
    <circle className="art-cobalt" cx="84" cy="66" r="2.5" />
    <Sparkle x={35} y={56} />
    <Sparkle x={140} y={30} scale={.59} />
  </>;
}

function Analytics() {
  return <>
    <rect className="art-sky" x="40" y="23" width="105" height="79" rx="8" transform="rotate(7 92 62)" />
    <rect className="art-paper" x="29" y="28" width="111" height="75" rx="8" />
    <path className="art-cyan" d="M37 28h95a8 8 0 0 1 8 8v8H29v-8a8 8 0 0 1 8-8Z" />
    <path d="M39 36h4m5 0h4m5 0h4M44 56v35h80" />
    <path className="art-sky" d="M52 77h11v14H52Z" />
    <path className="art-cyan" d="M70 70h11v21H70Z" />
    <path className="art-sky" d="M88 74h11v17H88Z" />
    <path className="art-cobalt" d="M106 59h11v32h-11Z" />
    <path d="m52 69 21-11 20 5 25-13m-9 0h9v9" />
    <Sparkle x={152} y={42} scale={.65} />
    <Sparkle x={135} y={17} />
  </>;
}

function Labels() {
  return <>
    <path className="art-sky" d="M50 31h59l24 24-39 42-44-37Z" />
    <path className="art-cyan" d="M53 42h54l24 21-24 33H53a6 6 0 0 1-6-6V48a6 6 0 0 1 6-6Z" transform="rotate(-13 89 69)" />
    <path className="art-paper" d="M47 48h62l30 26-30 26H47a7 7 0 0 1-7-7V55a7 7 0 0 1 7-7Z" />
    <circle className="art-sky" cx="121" cy="74" r="5" />
    <path d="M121 74c18-12 30-11 31-2 1 8-13 10-17 5m-74-4h36m-36 8h24" />
    <Sparkle x={32} y={40} />
    <Sparkle x={137} y={36} scale={.68} />
  </>;
}

function History() {
  return <>
    <path className="art-sky" d="M35 62h86v39H35Z" />
    <path className="art-cobalt" d="M121 62h16v34l-16 5Z" />
    <path className="art-paper" d="M53 28h60l13 35H41Z" />
    <path className="art-sky" d="M66 22h43l10 12H66Z" />
    <path d="M56 43h47m-50 7h45m-48 7h44" />
    <path className="art-cyan" d="M31 62h98v13H31Z" />
    <rect className="art-paper" x="61" y="81" width="36" height="11" rx="3" />
    <path d="M70 86.5h18" />
    <circle className="art-paper" cx="132" cy="90" r="18" />
    <path d="M132 80v10l7 3m-15-17 4 2m14-2-3 3" />
    <Sparkle x={143} y={42} />
    <Sparkle x={36} y={36} scale={.59} />
  </>;
}

const motifs = {
  growth: Growth,
  tasks: Tasks,
  test: Test,
  mistakes: Mistakes,
  materials: Materials,
  focus: Focus,
  analytics: Analytics,
  labels: Labels,
  history: History,
  notebook: Notebook,
};

export type StudyIllustrationVariant = keyof typeof motifs;

type StudyIllustrationProps = {
  variant: StudyIllustrationVariant;
  className?: string;
  size?: number;
};

export function StudyIllustration({ variant, className = '', size = 160 }: StudyIllustrationProps) {
  const Motif = motifs[variant];
  return <svg className={`study-illustration ${className}`} viewBox="0 0 180 126" width={size} height={size * .7} aria-hidden="true" focusable="false">
    <ellipse className="art-shadow" cx="90" cy="112" rx="61" ry="6" />
    <g className="art-object" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <Motif />
    </g>
  </svg>;
}
