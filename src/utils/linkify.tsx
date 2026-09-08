import React from 'react';

// Render plain text with clickable URLs and preserved line breaks.
// Used for profile/search descriptions (pipeline emits bare URLs).
export function linkify(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const urlRe = /(https?:\/\/[^\s)]+?)([.,;:!?)\]]*$)/g;
  let key = 0;
  for (const para of text.split('\n')) {
    if (out.length) out.push(<br key={`br${key++}`} />);
    if (!para) continue;
    let last = 0;
    let m: RegExpExecArray | null;
    urlRe.lastIndex = 0;
    while ((m = urlRe.exec(para))) {
      if (m.index > last) out.push(para.slice(last, m.index));
      const url = m[1];
      const trail = m[2] ?? '';
      out.push(
        <a key={`a${key++}`} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          {url}
        </a>,
      );
      if (trail) out.push(trail);
      last = m.index + m[0].length;
    }
    if (last < para.length) out.push(para.slice(last));
  }
  return out;
}
