"""Generate a small synthetic PDF fixture. No third-party paper or claims."""
from pathlib import Path
pages = [
['Paper2Slides - Synthetic Demonstration', 'Retrieval-assisted question answering', 'DEMO DOCUMENT - NOT A REAL RESEARCH PAPER', '', 'Abstract', 'This synthetic document demonstrates PDF reading, source tracing,', 'figure cropping and editable presentation export.', '', '1 Introduction', 'Long documents contain information that may not answer a specific question.', 'A retrieval step selects relevant passages before composing an answer.', '', '2 Method', 'Split the document into passages and preserve original PDF page numbers.', 'Retrieve relevant passages and assemble an evidence-based response.'],
['3 Workflow', 'The following diagram is synthetic and contains no measured results.', '', '', '', '', '', '', '', '', '', '', 'Figure 1: A synthetic retrieval and answer workflow.', '', 'The answer should cite the passage used as evidence.', 'Human review is still needed to check the claim against the source.'],
['4 Evaluation', 'A real evaluation should specify datasets, metrics and comparison methods.', 'No experimental values are reported in this demonstration document.', '', '5 Limitations', 'Retrieval may omit relevant context.', 'A citation being present does not establish that a claim is correct.', '', '6 Conclusion', 'Use this document only to exercise the product interaction.', '', 'References', 'This is synthetic material authored for the Paper2Slides demo.']]
objs=[]
def add(s):
    objs.append(s.encode('ascii') if isinstance(s,str) else s)
    return len(objs)
add('<< /Type /Catalog /Pages 2 0 R >>')
add('<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R] /Count 3 >>')
add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
for i,lines in enumerate(pages):
    add(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {5+i*2} 0 R >>')
    content=['BT /F1 12 Tf 48 740 Td 22 TL']
    for j,line in enumerate(lines):
        if j: content.append('T*')
        esc=line.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
        content.append('('+esc+') Tj')
    content.append('ET')
    if i==1:
        content.extend(['0.90 0.94 0.87 rg 55 385 500 175 re f','0.25 0.4 0.3 RG 70 440 125 60 re S 245 440 125 60 re S 420 440 120 60 re S', '195 470 m 245 470 l S 370 470 m 420 470 l S','0.15 0.25 0.2 rg BT /F1 12 Tf 85 465 Td (Document) Tj 172 0 Td (Retrieve) Tj 175 0 Td (Answer) Tj ET'])
    raw='\n'.join(content).encode('ascii')
    add(b'<< /Length '+str(len(raw)).encode()+b' >>\nstream\n'+raw+b'\nendstream')
output=bytearray(b'%PDF-1.4\n'); offsets=[0]
for i,o in enumerate(objs,1):
    offsets.append(len(output));output.extend(f'{i} 0 obj\n'.encode()+o+b'\nendobj\n')
xref=len(output);output.extend(f'xref\n0 {len(objs)+1}\n0000000000 65535 f \n'.encode())
for offset in offsets[1:]:output.extend(f'{offset:010d} 00000 n \n'.encode())
output.extend(f'trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode())
Path('public/demo.pdf').write_bytes(output)
