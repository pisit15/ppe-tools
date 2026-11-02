// Tests interact with the field's public native control, whether a company uses
// the original tick matrix or the generic template editor.
async function setPermitChoice(page, id, value) {
  const field = page.locator(`[id="${id}"]`);
  if (await field.evaluate(element => element.tagName === 'SELECT')) {
    await field.selectOption(value);
  } else {
    await field.locator(`input[type="radio"][value="${value}"]`).check();
  }
}

async function permitFieldDisabled(field) {
  const control = field.locator('input, select, textarea').first();
  return await control.count() > 0 && await control.isDisabled();
}

module.exports = { setPermitChoice, permitFieldDisabled };
