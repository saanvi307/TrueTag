import { auth } from '@/auth';
import { databaseError, getPool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';

const checklist = [
  ['food_storage', 'Food storage'],
  ['personal_hygiene', 'Personal hygiene'],
  ['sanitation', 'Sanitation'],
  ['pest_control', 'Pest control'],
  ['water_quality_documentation', 'Water quality documentation'],
  ['food_labelling', 'Food labelling'],
  ['temperature_control', 'Temperature control'],
] as const;

type DrawCommand = string;
type ReportPage = { commands: DrawCommand[]; y: number };
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function ascii(value: unknown) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/·/g, '-')
    .replace(/[^\x20-\x7e]/g, '?');
}

function literal(value: string) { return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
function number(value: number) { return Number(value.toFixed(3)).toString(); }

function makePdf(pages: ReportPage[]) {
  const objects = new Map<number, string>();
  const pageIds = pages.map((_, index) => 5 + index);
  objects.set(1, '<< /Type /Catalog /Pages 2 0 R >>');
  objects.set(2, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  objects.set(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.set(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = 5 + pages.length + index;
    page.commands.push(`0.86 0.9 0.95 RG 48 37 m 547 37 l S`);
    page.commands.push(`BT /F1 7 Tf 0.42 0.49 0.58 rg 48 24 Td (${literal(`TruTag | Digital Inspection Passport | Page ${index + 1} of ${pages.length}`)}) Tj ET`);
    const content = page.commands.join('\n');
    objects.set(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
    objects.set(contentId, `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}\nendstream`);
  });
  const maxId = Math.max(...objects.keys());
  let document = '%PDF-1.4\n% TruTag Inspection Passport\n';
  const offsets = new Array<number>(maxId + 1).fill(0);
  for (let id = 1; id <= maxId; id += 1) {
    const body = objects.get(id);
    if (!body) continue;
    offsets[id] = Buffer.byteLength(document, 'ascii');
    document += `${id} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, 'ascii');
  document += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) document += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  document += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, 'ascii');
}

function addText(page: ReportPage, x: number, baseline: number, text: string, size = 9, bold = false, color = [0.16, 0.22, 0.31]) {
  const safe = literal(ascii(text));
  page.commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${number(color[0])} ${number(color[1])} ${number(color[2])} rg 1 0 0 1 ${number(x)} ${number(PAGE_HEIGHT - baseline)} Tm (${safe}) Tj ET`);
}

function addRect(page: ReportPage, x: number, top: number, width: number, height: number, color: number[]) {
  page.commands.push(`${number(color[0])} ${number(color[1])} ${number(color[2])} rg ${x} ${PAGE_HEIGHT - top - height} ${width} ${height} re f`);
}

function createPage(pageNumber: number): ReportPage {
  const page: ReportPage = { commands: [], y: 128 };
  addRect(page, 0, 0, PAGE_WIDTH, 102, [0.055, 0.11, 0.2]);
  addRect(page, 0, 98, PAGE_WIDTH, 4, [0.2, 0.51, 0.88]);
  addRect(page, MARGIN, 23, 24, 24, [0.2, 0.51, 0.88]);
  addText(page, MARGIN + 5, 39, 'T', 14, true, [1, 1, 1]);
  addText(page, MARGIN + 34, 36, 'TRUTAG', 12, true, [1, 1, 1]);
  addText(page, MARGIN + 34, 49, 'FOOD SAFETY OFFICER PORTAL', 6, true, [0.68, 0.76, 0.86]);
  addText(page, MARGIN, 77, pageNumber === 1 ? 'DIGITAL INSPECTION PASSPORT' : 'DIGITAL INSPECTION PASSPORT - CONTINUED', 13, true, [1, 1, 1]);
  return page;
}

function section(page: ReportPage, title: string) {
  addRect(page, MARGIN, page.y, CONTENT_WIDTH, 22, [0.92, 0.96, 0.99]);
  addRect(page, MARGIN, page.y, 3, 22, [0.2, 0.51, 0.88]);
  addText(page, MARGIN + 11, page.y + 15, ascii(title).toUpperCase(), 8, true, [0.13, 0.24, 0.38]);
  page.y += 33;
}

function ensureSpace(pages: ReportPage[], current: { page: ReportPage }, height: number) {
  if (current.page.y + height <= PAGE_HEIGHT - 58) return;
  current.page = createPage(pages.length + 1);
  pages.push(current.page);
}

function detail(pages: ReportPage[], current: { page: ReportPage }, label: string, value: unknown, x = MARGIN, width = CONTENT_WIDTH, size = 9) {
  const text = ascii(value || 'Not recorded');
  const maxChars = Math.max(14, Math.floor(width / (size * 0.53)));
  const lines = text.match(new RegExp(`.{1,${maxChars}}(?:\\s|$)|.{1,${maxChars}}`, 'g')) || [''];
  const height = 28 + Math.max(0, lines.length - 1) * (size + 3);
  ensureSpace(pages, current, height);
  addText(current.page, x, current.page.y, label.toUpperCase(), 6.5, true, [0.52, 0.59, 0.67]);
  lines.forEach((line, index) => addText(current.page, x, current.page.y + 12 + index * (size + 3), line.trim(), size, false, [0.16, 0.22, 0.31]));
  current.page.y += height;
}

function wrappedLines(value: unknown, maxChars: number) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const parts = word.match(new RegExp(`.{1,${maxChars}}`, 'g')) || [word];
    for (const part of parts) {
      if (line && `${line} ${part}`.length > maxChars) { lines.push(line); line = part; }
      else line = line ? `${line} ${part}` : part;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['No observation recorded.'];
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (session?.user.role !== 'officer' || !session.user.officerId || !session.user.id) return Response.json({ error: 'Officer sign in required.' }, { status: 401 });
  const assignmentId = Number((await params).id);
  if (!Number.isSafeInteger(assignmentId) || assignmentId < 1) return Response.json({ error: 'Invalid inspection assignment.' }, { status: 400 });

  try {
    const [assignments] = await getPool().execute<RowDataPacket[]>(
      `SELECT a.id, a.inspection_type, DATE_FORMAT(a.inspection_date, '%Y-%m-%d') AS inspection_date,
        a.jurisdiction AS inspection_jurisdiction, a.status AS assignment_status,
        o.officer_id, o.name AS officer_name, o.designation, o.department, o.district AS officer_district,
        o.jurisdiction AS officer_jurisdiction, o.credential_status, o.status AS officer_status,
        b.business_name, b.licence_reference, b.category AS business_category, b.address AS business_address,
        b.district AS business_district, b.jurisdiction AS business_jurisdiction
       FROM trutag_inspection_assignments a
       JOIN trutag_officers o ON o.id = a.officer_id
       JOIN trutag_food_businesses b ON b.id = a.food_business_id
       JOIN trutag_user_accounts u ON u.officer_id = o.id AND u.role = 'officer'
       WHERE a.id = ? AND a.officer_id = ? AND u.id = ? AND u.is_active = 1 LIMIT 1`,
      [assignmentId, session.user.officerId, Number(session.user.id)],
    );
    if (!assignments.length) return Response.json({ error: 'Inspection assignment not found for this officer.' }, { status: 404 });
    const assignment = assignments[0];
    const [responses] = await getPool().execute<RowDataPacket[]>(
      `SELECT checklist_key, response, observation, updated_at
       FROM trutag_inspection_checklist_responses WHERE assignment_id = ?`, [assignmentId],
    );
    const responseMap = new Map(responses.map(row => [String(row.checklist_key), row]));
    const completedCount = checklist.filter(([key]) => responseMap.has(key)).length;
    const reportStatus = assignment.assignment_status === 'cancelled'
      ? 'CANCELLED'
      : assignment.assignment_status === 'completed'
        ? completedCount === checklist.length ? 'COMPLETED' : `COMPLETED - CHECKLIST INCOMPLETE (${completedCount}/7)`
        : completedCount === checklist.length ? 'READY FOR REVIEW' : `IN PROGRESS (${completedCount}/7 ITEMS)`;

    const pages: ReportPage[] = [];
    const current = { page: createPage(1) };
    pages.push(current.page);
    const generatedAt = new Date();
    addRect(current.page, MARGIN, current.page.y, CONTENT_WIDTH, 57, [0.96, 0.98, 1]);
    addText(current.page, MARGIN + 13, current.page.y + 16, 'REPORT STATUS', 6.5, true, [0.48, 0.56, 0.66]);
    addText(current.page, MARGIN + 13, current.page.y + 34, reportStatus, 11, true, [0.1, 0.36, 0.66]);
    addText(current.page, MARGIN + 13, current.page.y + 49, `Generated ${generatedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST`, 7, false, [0.43, 0.51, 0.6]);
    addText(current.page, 392, current.page.y + 34, `REF ${String(assignment.id).padStart(6, '0')}`, 9, true, [0.1, 0.28, 0.49]);
    current.page.y += 72;

    section(current.page, 'Officer details');
    detail(pages, current, 'Officer name', assignment.officer_name);
    detail(pages, current, 'Officer ID', assignment.officer_id);
    detail(pages, current, 'Designation', assignment.designation);
    detail(pages, current, 'Department', assignment.department);
    detail(pages, current, 'District / jurisdiction', `${assignment.officer_district} / ${assignment.officer_jurisdiction}`);
    detail(pages, current, 'Digital credential status', `${assignment.credential_status} - officer access ${assignment.officer_status}`);

    section(current.page, 'Food business details');
    detail(pages, current, 'Business name', assignment.business_name);
    detail(pages, current, 'FSSAI licence reference', assignment.licence_reference);
    detail(pages, current, 'Business category', assignment.business_category);
    detail(pages, current, 'Business address', assignment.business_address);
    detail(pages, current, 'District / jurisdiction', `${assignment.business_district} / ${assignment.business_jurisdiction}`);

    section(current.page, 'Inspection reference');
    detail(pages, current, 'Inspection reference', `TRUTAG-${String(assignment.id).padStart(6, '0')}`);
    detail(pages, current, 'Inspection type', assignment.inspection_type);
    detail(pages, current, 'Scheduled date', assignment.inspection_date);
    detail(pages, current, 'Inspection jurisdiction', assignment.inspection_jurisdiction);
    detail(pages, current, 'Assignment status', assignment.assignment_status);

    ensureSpace(pages, current, 110);
    section(current.page, 'Checklist responses and observations');
    for (const [key, label] of checklist) {
      const response = responseMap.get(key);
      const status = response ? String(response.response).replaceAll('_', ' ').toUpperCase() : 'NOT RECORDED';
      ensureSpace(pages, current, 45);
      addText(current.page, MARGIN, current.page.y, label, 9, true, [0.14, 0.24, 0.37]);
      addText(current.page, 389, current.page.y, status, 7.5, true, response?.response === 'non_compliant' ? [0.72, 0.25, 0.23] : response ? [0.13, 0.48, 0.34] : [0.55, 0.59, 0.65]);
      current.page.y += 13;
      const timestamp = response ? new Date(response.updated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) + ' IST' : 'No response timestamp';
      addText(current.page, MARGIN, current.page.y, `Recorded: ${timestamp}`, 7, false, [0.49, 0.56, 0.64]);
      current.page.y += 12;
      const lines = wrappedLines(response?.observation || 'No observation recorded.', 92);
      for (const line of lines) {
        ensureSpace(pages, current, 13);
        addText(current.page, MARGIN + 8, current.page.y, line, 8, false, [0.25, 0.32, 0.41]);
        current.page.y += 11;
      }
      current.page.y += 9;
    }

    const pdf = makePdf(pages);
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="trutag-inspection-passport-${assignment.id}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { return databaseError(error); }
}
