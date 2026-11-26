// Draws the small formation diagrams on the details page from data-marks="col,row,kind ...".
for (const field of document.querySelectorAll('.field')) {
  const marks = new Map(
    field.dataset.marks.split(' ').map((m) => {
      const [c, r, kind] = m.split(',');
      return [`${c},${r}`, kind];
    }),
  );
  field.setAttribute('role', 'img');
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('span');
      const kind = marks.get(`${c},${r}`);
      if (kind) cell.className = 'led' + (kind === 'dim' ? ' led-dim' : kind === 'ball' ? ' led-blink' : '');
      const wrap = document.createElement('span');
      wrap.className = 'field-cell';
      wrap.appendChild(cell);
      field.appendChild(wrap);
    }
  }
}
