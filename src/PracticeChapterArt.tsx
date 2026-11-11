import type { PracticeChapter } from './practice-types';

function ChapterMotif({ chapter }: { chapter: PracticeChapter }) {
  const title = chapter.title.toLowerCase();

  if (chapter.subject === 'Mathematics') {
    if (/set|relation/.test(title)) return <>
      <ellipse className="practice-art-fill" cx="89" cy="67" rx="45" ry="39" />
      <ellipse className="practice-art-fill" cx="151" cy="67" rx="45" ry="39" />
      <path className="practice-art-strong" d="M120 39a39 39 0 0 1 0 56 39 39 0 0 1 0-56Z" />
      <circle className="practice-art-paper" cx="77" cy="55" r="6" />
      <circle className="practice-art-paper" cx="94" cy="81" r="6" />
      <circle className="practice-art-paper" cx="120" cy="65" r="6" />
      <circle className="practice-art-paper" cx="158" cy="53" r="6" />
      <circle className="practice-art-paper" cx="171" cy="78" r="6" />
      <path d="m204 39 6-8m-2 15 9-3M36 83l-7 5" />
    </>;
    if (/function|mapping/.test(title) && !/trigonometric|differential/.test(title)) return <>
      <ellipse className="practice-art-fill" cx="73" cy="66" rx="30" ry="43" />
      <ellipse className="practice-art-paper" cx="167" cy="66" rx="30" ry="43" />
      <path d="M81 43c27-7 50 3 77 22m-77 0h77m-77 22c30 5 54-5 77-22m-9-3 9 3-7 5" />
      <circle className="practice-art-strong" cx="73" cy="43" r="6" />
      <circle className="practice-art-strong" cx="73" cy="65" r="6" />
      <circle className="practice-art-strong" cx="73" cy="87" r="6" />
      <circle className="practice-art-fill" cx="167" cy="43" r="6" />
      <circle className="practice-art-strong" cx="167" cy="65" r="6" />
      <circle className="practice-art-fill" cx="167" cy="87" r="6" />
    </>;
    if (/series|sequence|progression/.test(title)) return <>
      <path className="practice-art-fill" d="M54 99V88h21V76h22V64h22V52h23V40h22v59Z" />
      <path className="practice-art-strong" d="M75 88v11m22-23v23m22-35v35m23-47v47" />
      <path d="M50 105h135m-3-75 9-6m-7 14 10-1M95 48l46-25m-11-2 11 2-4 10" />
      <circle className="practice-art-paper" cx="65" cy="84" r="4" />
      <circle className="practice-art-paper" cx="87" cy="72" r="4" />
      <circle className="practice-art-paper" cx="109" cy="60" r="4" />
      <circle className="practice-art-paper" cx="132" cy="48" r="4" />
      <circle className="practice-art-paper" cx="153" cy="36" r="4" />
    </>;
    if (/trigonometric|complex/.test(title)) return <>
      <circle className="practice-art-paper" cx="115" cy="67" r="40" />
      <path className="practice-art-fill" d="M115 67h40a40 40 0 0 0-12-29Z" />
      <path d="M62 67h115m-62 51V17m-5 7 5-7 5 7m49 38 8 5-8 5m-54-5 28-29" />
      <path d="M143 38v29m-28-29h28" strokeDasharray="3 4" />
      <circle className="practice-art-strong" cx="143" cy="38" r="4" />
      <path d="m163 29 7-5m-4 13 9-1" />
    </>;
    if (/matrix|matrices|determinant|linear/.test(title)) return <>
      <path className="practice-art-strong" d="m64 88 86 8 36-58-87-8Z" />
      <path className="practice-art-paper" d="m56 82 86 8 36-58-87-8Z" />
      <path d="m68 63 86 8m-75-27 86 8M85 85l35-58m-7 61 36-58" />
      <path className="practice-art-fill" d="m97 67 28 3 12-19-28-3Z" />
      <path d="M45 58v24l8 3m123-57 10 2v25m14 5 5-7m-3 13 7-2" />
    </>;
    if (/probability|permutation|combination|statistics|binomial/.test(title)) return <>
      <path className="practice-art-fill" d="m69 51 36-11 33 20-3 37-36 10-32-20Z" />
      <path className="practice-art-paper" d="m69 51 33 19 36-10m-36 10-3 37" />
      <path className="practice-art-strong" d="m135 45 24-17 29 8 6 30-24 17-29-8Z" />
      <path d="m135 45 29 8 24-17m-24 17 6 30" />
      <g className="practice-art-ink" stroke="none">
        <circle cx="86" cy="56" r="2.5" /><circle cx="104" cy="61" r="2.5" /><circle cx="118" cy="55" r="2.5" />
        <circle cx="79" cy="72" r="2.5" /><circle cx="88" cy="88" r="2.5" /><circle cx="119" cy="83" r="2.5" />
        <circle cx="151" cy="41" r="2.5" /><circle cx="174" cy="39" r="2.5" /><circle cx="150" cy="61" r="2.5" />
        <circle cx="178" cy="65" r="2.5" />
      </g>
    </>;
    if (/geometr|conic|circle|vector|line|triangle/.test(title)) return <>
      <path d="M59 104h122m-95 0V31m-6 8 6-8 6 8m81 58 8 7-8 6" />
      <path className="practice-art-fill" d="m86 94 72-45-29 45Z" />
      <path className="practice-art-paper" d="M98 94V83H86" />
      <path d="m122 45 31-9 21 12m-27-18 6 6-6 5m20 4 7 3-5 5" />
      <circle className="practice-art-strong" cx="158" cy="49" r="5" />
      <circle className="practice-art-strong" cx="129" cy="94" r="4" />
    </>;
    return <>
      <path className="practice-art-fill" d="M63 83c20 0 33-33 52-33s22 24 38 24c11 0 19-8 27-18v36H63Z" />
      <path d="M59 99h130m-127 0V28m-6 8 6-8 6 8m112 57 9 6-9 6" />
      <path d="M62 83c20 0 34-33 53-33s22 24 38 24c11 0 19-8 27-18" />
      <path d="M115 55v43m39-19v19" strokeDasharray="3 4" />
      <circle className="practice-art-strong" cx="115" cy="50" r="4" />
      <path d="m186 39 7-7m-3 13 9-1" />
    </>;
  }

  if (chapter.subject === 'Physics') {
    if (/general|unit|measure/.test(title)) return <>
      <path className="practice-art-fill" d="m51 38 113 15-2 12L49 50Z" />
      <path className="practice-art-paper" d="m50 31 12 2-5 40-12-2Zm56 9 13 2-5 38-13-2Z" />
      <path d="m73 42-1 7m11-6-1 8m11-7-1 7m38-2-1 7m11-6-1 7m11-6-1 7M53 82l48 7m-45-10-3 3 2 4m41 0 5 3-4 3" />
      <circle className="practice-art-strong" cx="162" cy="81" r="25" />
      <circle className="practice-art-paper" cx="162" cy="81" r="19" />
      <path d="m161 80 8-10m-8-15v-8m-4 0h8m14 15 5-5" />
    </>;
    if (/kinematic|projectile/.test(title)) return <>
      <path d="M43 104h154m-140-3c23-88 102-95 130 0" />
      <path d="M59 97c20-64 61-79 88-58" strokeDasharray="4 5" />
      <circle className="practice-art-strong" cx="119" cy="32" r="7" />
      <circle className="practice-art-fill" cx="76" cy="64" r="5" />
      <circle className="practice-art-paper" cx="171" cy="69" r="5" />
      <path d="M57 101 40 77m5 1-5-1v6m142 12 9-1m-3-6 6-4" />
      <path className="practice-art-fill" d="M51 105h142v7H51Z" />
    </>;
    if (/law.*motion|force|property|properties/.test(title)) return <>
      <path className="practice-art-fill" d="M55 97h130v9H55Z" />
      <rect className="practice-art-strong" x="80" y="66" width="57" height="30" rx="4" />
      <rect className="practice-art-paper" x="94" y="43" width="30" height="23" rx="3" />
      <path d="M137 81h34m-7-6 7 6-7 6M109 43V25m-6 6 6-6 6 6M77 83H61m5-5-5 5 5 5" />
      <path d="m81 103-5 3m24-3-5 3m24-3-5 3m24-3-5 3m24-3-5 3" />
    </>;
    if (/rotat|system of particle/.test(title)) return <>
      <circle className="practice-art-fill" cx="122" cy="68" r="40" />
      <circle className="practice-art-paper" cx="122" cy="68" r="31" />
      <path d="M91 68h62m-31-31v62m-22-9 44-44m-44 0 44 44" />
      <circle className="practice-art-strong" cx="122" cy="68" r="8" />
      <path d="M76 73a48 48 0 0 1 36-52m-10-1 10 1-7 8m64 29a46 46 0 0 1-29 54m9 1-9-1 5-7M61 64l8 3m104 27 9 4" />
    </>;
    if (/gravit|planet/.test(title)) return <>
      <circle className="practice-art-fill" cx="117" cy="68" r="30" />
      <path className="practice-art-strong" d="M92 55l15-8 10 5v9l-8 6 3 11-6 11-6-8-1-11-8-5Zm47 1-10 8 6 9 8 1 4-9Z" />
      <ellipse cx="119" cy="68" rx="71" ry="19" transform="rotate(-17 119 68)" strokeDasharray="4 5" />
      <circle className="practice-art-paper" cx="177" cy="49" r="9" />
      <path d="m59 44 4-8m0 11 9-4m94 46 6 6m-9-1 2 8" />
    </>;
    if (/optic|light|prism/.test(title)) return <>
      <path className="practice-art-fill" d="m88 101 40-68 39 68Z" />
      <path className="practice-art-paper" d="m128 33 14 68h25Z" />
      <path d="m45 58 62 11 39 4 50-21M147 74l49-6m-49 6 49 9m-49-9 49 23" />
      <path d="m69 58 7 6-9 3m113-21 4-5m-13 2 1-5M78 101h99" />
    </>;
    if (/wave|sound|oscillat|shm/.test(title)) return <>
      <path className="practice-art-fill" d="M58 70c19 0 23-29 42-29s23 29 42 29H58Z" />
      <path className="practice-art-fill" d="M142 70c18 0 22 29 41 29s23-29 32-29H142Z" />
      <path d="M33 70h184m-184 32V34m-6 9 6-9 6 9m171 21 7 6-7 6" />
      <path d="M34 70h24c19 0 23-29 42-29s23 29 42 29 22 29 41 29 23-29 32-29" />
      <path d="M100 47v23m83 6v19" strokeDasharray="3 4" />
      <circle className="practice-art-strong" cx="100" cy="41" r="4" />
      <circle className="practice-art-strong" cx="183" cy="99" r="4" />
    </>;
    if (/electric|magnet|current|capacit|circuit|semi|induction/.test(title)) return <>
      <path d="M75 72V57h34m26 0h34v31H75v-8" />
      <path className="practice-art-fill" d="M111 38h7v38h-7Zm17 0h7v38h-7Z" />
      <rect className="practice-art-paper" x="59" y="67" width="31" height="21" rx="4" />
      <path d="M66 72v11m-4-6h8m10 0h6M162 87h14" />
      <path className="practice-art-strong" d="M161 88h17v10h-17Z" />
      <path d="m116 26 3-7m7 7 4-8m5 11 7-5m41 43 6-6m-3 13 8-3" />
    </>;
    if (/atom|nuclei|nuclear|radiat|photoelectric|dual nature/.test(title)) return <AtomMotif />;
    if (/thermo|thermal|kinetic|heat|fluid|gas/.test(title)) return <>
      <path className="practice-art-paper" d="M91 43h58v55a8 8 0 0 1-8 8H99a8 8 0 0 1-8-8Z" />
      <path className="practice-art-fill" d="M99 73h42v24a2 2 0 0 1-2 2h-38a2 2 0 0 1-2-2Z" />
      <path className="practice-art-strong" d="M94 63h52v10H94Z" />
      <path d="M120 62V29m-11 0h22M103 87l5-5m20 12 5-5m-21 4 2-2" />
      <path d="M167 61V41m-5 6 5-6 5 6m-99 11 5-6m-11 12 7-1M81 109h78" />
    </>;
    return <>
      <path className="practice-art-fill" d="m58 91 113-48 9 19-114 47Z" />
      <path d="M59 110h127m-12-67-4-11m12 17 12-3" />
      <circle className="practice-art-paper" cx="117" cy="55" r="18" />
      <path className="practice-art-strong" d="M127 49a11 11 0 1 1-20 10 11 11 0 0 1 20-10Z" />
      <path d="m103 45-20 8m17 1-17 7m10 4-7 3m55-28 14-6m-6-4 6 4-2 6" />
    </>;
  }

  if (/atom|periodic|element|block/.test(title)) return <AtomMotif />;
  if (/organic|alk|hydrocarbon|molecular|bond|coordination|biomolecule|polymer|amine|ether|ketone|acid/.test(title)) return <>
    <path className="practice-art-fill" d="m69 56 20-12 21 12v24L89 92 69 80Zm70-11 20-12 21 12v24l-21 12-20-12Z" />
    <path d="m76 59 13-7m14 8v15M78 79l11 6m57-37 13-7m14 8v15m-25 4 11 6m-49-18 29 1M69 69H52m128-12h15m-36 24v16" />
    <circle className="practice-art-strong" cx="49" cy="69" r="5" />
    <circle className="practice-art-paper" cx="198" cy="57" r="5" />
    <circle className="practice-art-strong" cx="159" cy="100" r="5" />
    <path d="m68 35-7-8m2 15-9-1m130 36 6 5" />
  </>;
  if (/electro|redox|equilib|solution|liquid/.test(title)) return <>
    <path className="practice-art-paper" d="M59 57h49v43a7 7 0 0 1-7 7H66a7 7 0 0 1-7-7Zm73 0h49v43a7 7 0 0 1-7 7h-35a7 7 0 0 1-7-7Z" />
    <path className="practice-art-fill" d="M64 76h39v23a3 3 0 0 1-3 3H67a3 3 0 0 1-3-3Zm73 1h39v22a3 3 0 0 1-3 3h-33a3 3 0 0 1-3-3Z" />
    <path d="M82 84V46a11 11 0 0 1 11-11h54a11 11 0 0 1 11 11v38M96 63h7m-7 7h7m66-7h7m-7 7h7M69 88h5m-2-3v6m74 0h5" />
    <circle className="practice-art-strong" cx="120" cy="35" r="10" />
    <path d="m122 28-5 7h5l-4 6" />
  </>;
  return <>
    <path className="practice-art-paper" d="M79 35h20m-17 0v30L64 97a7 7 0 0 0 6 10h38a7 7 0 0 0 6-10L96 65V35" />
    <path className="practice-art-fill" d="M74 83c11-7 20 7 31 2l9 12a7 7 0 0 1-6 10H70a7 7 0 0 1-6-10Z" />
    <path className="practice-art-paper" d="M135 51h35m-31 0v44a12 12 0 0 0 12 12h3a12 12 0 0 0 12-12V51" />
    <path className="practice-art-strong" d="M144 76h17v19a8 8 0 0 1-8 8h-1a8 8 0 0 1-8-8Z" />
    <circle className="practice-art-strong" cx="88" cy="25" r="5" />
    <circle className="practice-art-fill" cx="101" cy="20" r="3" />
    <circle className="practice-art-paper" cx="87" cy="94" r="3" />
    <path d="m177 65 5-5m-4 11 8-1M58 108h124" />
  </>;
}

function AtomMotif() {
  return <>
    <circle className="practice-art-fill" cx="120" cy="67" r="36" />
    <ellipse cx="120" cy="67" rx="59" ry="18" transform="rotate(-23 120 67)" />
    <ellipse cx="120" cy="67" rx="59" ry="18" transform="rotate(37 120 67)" />
    <ellipse cx="120" cy="67" rx="59" ry="18" transform="rotate(91 120 67)" />
    <circle className="practice-art-strong" cx="120" cy="67" r="8" />
    <circle className="practice-art-paper" cx="84" cy="35" r="5" />
    <circle className="practice-art-paper" cx="169" cy="44" r="5" />
    <circle className="practice-art-paper" cx="117" cy="112" r="5" />
    <path d="m191 69 6-3m-5 9 7 1M54 60l-8-4" />
  </>;
}

export function PracticeChapterArt({ chapter }: { chapter: PracticeChapter }) {
  return <span className="practice-chapter-art" data-subject={chapter.subject} aria-hidden="true">
    <svg viewBox="0 0 240 130" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
      <ChapterMotif chapter={chapter} />
    </svg>
  </span>;
}
