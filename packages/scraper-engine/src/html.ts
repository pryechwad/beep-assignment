import * as cheerio from 'cheerio';

const BLOCK = 'p,div,br,li,ul,ol,h1,h2,h3,h4,h5,h6,section,article,tr,table,blockquote';

/** Decode HTML entities (Greenhouse returns entity-escaped HTML). */
export function decodeEntities(input: string): string {
  return cheerio.load(`<textarea>${input}</textarea>`, null, false)('textarea').text();
}

/** Convert job-description HTML to readable plain text, preserving paragraph and list breaks. */
export function htmlToText(html: string): string {
  const $ = cheerio.load(html, null, false);
  $('script,style,noscript').remove();
  $('li').each((_, el) => {
    $(el).prepend('• ');
  });
  $(BLOCK).each((_, el) => {
    $(el).append('\n');
  });
  return $.root()
    .text()
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip potentially dangerous markup while keeping structure, for display of source HTML. */
export function sanitizeHtml(html: string): string {
  const $ = cheerio.load(html, null, false);
  $('script,style,iframe,object,embed,form,input,button,noscript').remove();
  $('*').each((_, el) => {
    if (el.type !== 'tag') return;
    for (const name of Object.keys(el.attribs)) {
      const value = el.attribs[name] ?? '';
      const keep = (name === 'href' && /^https?:\/\//i.test(value)) || name === 'colspan' || name === 'rowspan';
      if (!keep) $(el).removeAttr(name);
    }
    if (el.tagName === 'a') $(el).attr('rel', 'noopener noreferrer nofollow').attr('target', '_blank');
  });
  return $.html();
}
