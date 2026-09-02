// Clinic hours: 9:00 AM - 1:00 PM and 2:00 PM - 6:00 PM, 30-minute slots,
// with a lunch break between 1:00 PM and 2:00 PM. Centralized here so the
// availability-check route and the booking-validation route can never
// drift out of sync with each other.
function generateSlots() {
  const ranges = [
    { startHour: 9, endHour: 13 }, // 9:00 - 13:00
    { startHour: 14, endHour: 18 }, // 14:00 - 18:00
  ];
  const slots = [];

  for (const { startHour, endHour } of ranges) {
    for (let h = startHour; h < endHour; h++) {
      for (const m of [0, 30]) {
        const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const period = h < 12 ? 'AM' : 'PM';
        const hour12 = h % 12 === 0 ? 12 : h % 12;
        const label = `${hour12}:${String(m).padStart(2, '0')} ${period}`;
        slots.push({ value, label });
      }
    }
  }
  return slots;
}

module.exports = { generateSlots };