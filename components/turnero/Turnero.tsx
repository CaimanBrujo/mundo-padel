'use client';

import { useState, useRef, useEffect } from 'react';
import supabase from '@/lib/supabaseClient';
import { useUser } from '@/context/UserContext';

const allSlots = [
  { start: '08:00', end: '08:30' },
  { start: '08:30', end: '09:00' },
  { start: '09:00', end: '09:30' },
  { start: '09:30', end: '10:00' },
  { start: '10:00', end: '10:30' },
  { start: '10:30', end: '11:00' },
  { start: '11:00', end: '11:30' },
  { start: '11:30', end: '12:00' },
  { start: '12:00', end: '12:30' },
  { start: '12:30', end: '13:00' },
  { start: '13:00', end: '13:30' },
  { start: '13:30', end: '14:00' },
  { start: '14:00', end: '14:30' },
  { start: '14:30', end: '15:00' },
  { start: '15:00', end: '15:30' },
  { start: '15:30', end: '16:00' },
  { start: '16:00', end: '16:30' },
  { start: '16:30', end: '17:00' },
  { start: '17:00', end: '17:30' },
  { start: '17:30', end: '18:00' },
  { start: '18:00', end: '18:30' },
  { start: '18:30', end: '19:00' },
  { start: '19:00', end: '19:30' },
  { start: '19:30', end: '20:00' },
  { start: '20:00', end: '20:30' },
  { start: '20:30', end: '21:00' },
  { start: '21:00', end: '21:30' },
  { start: '21:30', end: '22:00' },
  { start: '22:00', end: '22:30' },
  { start: '22:30', end: '23:00' },
  { start: '23:00', end: '23:30' },
  { start: '23:30', end: '00:00' },
];

export default function Turnero() {
  const { user, loading } = useUser();
  const baseDate = useRef(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [duration, setDuration] = useState<60 | 90 | 120>(90);
  const [showDurations, setShowDurations] = useState(false);
  const [hoverSlot, setHoverSlot] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [showEarly, setShowEarly] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [pendingBooking, setPendingBooking] = useState<any | null>(null);

  const slots = showEarly ? allSlots : allSlots.filter((slot) => slot.start >= '16:30');
  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const fetchBookings = async () => {
    const dateString = formatDate(selectedDate);
    const { data, error } = await supabase
      .from('bookings')
      .select(
        'id, user_id, court, date, start_time, end_time, duration_minutes, confirmed, expires_at, cancelled',
      )
      .eq('date', dateString);

    if (!error && data) setBookings(data);
  };

  useEffect(() => {
    fetchBookings();
  }, [selectedDate]);

  const changeDate = (offset: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(selectedDate.getDate() + offset);

    const minDate = new Date(baseDate.current);
    const maxDate = new Date(baseDate.current);
    maxDate.setDate(baseDate.current.getDate() + 6);

    if (newDate >= minDate && newDate <= maxDate) {
      setSelectedDate(newDate);
      setSelectedSlot(null);
      setPendingBooking(null);
    }
  };

  const isFullyReserved = (time: string) => {
    const [th, tm] = time.split(':').map(Number);
    const checkMinutes = th * 60 + tm;

    const count = bookings.filter((b) => {
      const [bh, bm] = b.start_time.split(':').map(Number);
      const bStart = bh * 60 + bm;
      const bEnd = bStart + (b.duration_minutes || 90);
      const active =
        (b.confirmed || (b.expires_at && new Date(b.expires_at) > new Date())) && !b.cancelled;
      return active && checkMinutes >= bStart && checkMinutes < bEnd;
    }).length;

    return count >= 3;
  };

  const canFitDuration = (start_time: string, dur: number) => {
    const [h, m] = start_time.split(':').map(Number);
    const startMinutes = h * 60 + m;
    const endMinutes = startMinutes + dur;

    for (let minute = startMinutes; minute < endMinutes; minute += 30) {
      const count = bookings.filter((b) => {
        const [bh, bm] = b.start_time.split(':').map(Number);
        const bStart = bh * 60 + bm;
        const bEnd = bStart + (b.duration_minutes || 90);
        const active =
          (b.confirmed || (b.expires_at && new Date(b.expires_at) > new Date())) && !b.cancelled;
        return active && minute >= bStart && minute < bEnd;
      }).length;

      if (count >= 3) return false;
    }

    return true;
  };

  // This version checks overlapping ranges for court assignment
  const createBooking = async () => {
    if (!user || loading || !selectedSlot) return;
    if (!canFitDuration(selectedSlot, duration)) {
      alert('Not enough space for this duration in the selected slot');
      return;
    }

    const dateString = formatDate(selectedDate);

    const [h, m] = selectedSlot.split(':').map(Number);
    const startMinutes = h * 60 + m;
    const endMinutes = startMinutes + duration;
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;

    const start_time = selectedSlot;
    const end_time = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;

    // Check overlapping bookings
    const takenCourts = bookings
      .filter((b) => {
        const active =
          (b.confirmed || (b.expires_at && new Date(b.expires_at) > new Date())) && !b.cancelled;
        if (!active) return false;

        const [bh, bm] = b.start_time.split(':').map(Number);
        const bStart = bh * 60 + bm;
        const [eh, em] = b.end_time.split(':').map(Number);
        const bEnd = eh * 60 + em;

        // Overlap check
        return startMinutes < bEnd && endMinutes > bStart;
      })
      .map((b) => b.court);

    const availableCourt = [1, 2, 3].find((c) => !takenCourts.includes(c));

    if (!availableCourt) {
      alert('All courts are occupied in this slot');
      return;
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        created_by: user.id,
        court: availableCourt,
        date: dateString,
        start_time,
        end_time,
        duration_minutes: duration,
        confirmed: false,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (!error && data) {
      setPendingBooking(data);
      fetchBookings();
      setSelectedSlot(null);
    } else {
      console.error('Insert error:', error);
    }
  };

  const isHighlighted = (time: string) => {
    const ref = selectedSlot || hoverSlot;
    if (!ref) return false;
    if (!canFitDuration(ref, duration)) return false;

    const [h, m] = time.split(':').map(Number);
    const [rh, rm] = ref.split(':').map(Number);
    const slotMinutes = h * 60 + m;
    const refMinutes = rh * 60 + rm;

    return slotMinutes >= refMinutes && slotMinutes < refMinutes + duration;
  };

  return (
    <section className="p-6 bg-background text-white min-h-[70vh]">
      {/* Date navigation */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => changeDate(-1)}
            className="bg-muted px-3 py-1 rounded hover:bg-muted/70"
          >
            ← Previous day
          </button>
          <span className="font-semibold">
            {selectedDate.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </span>
          <button
            onClick={() => changeDate(1)}
            className="bg-muted px-3 py-1 rounded hover:bg-muted/70"
          >
            Next day →
          </button>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowDurations(!showDurations)}
            className="bg-accent text-background px-4 py-2 rounded"
          >
            {duration} min
          </button>
          {showDurations && (
            <div className="absolute mt-2 bg-muted rounded shadow-lg flex flex-col">
              {[60, 90, 120].map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setDuration(d as 60 | 90 | 120);
                    setShowDurations(false);
                    setSelectedSlot(null);
                  }}
                  className={`px-4 py-2 hover:bg-muted/70 ${d === duration ? 'bg-accent text-background' : 'text-primary'}`}
                >
                  {d} min
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowEarly(!showEarly)}
          className="bg-muted px-3 py-1 rounded hover:bg-muted/70"
        >
          {showEarly ? 'Hide early' : 'Show early'}
        </button>
      </div>

      {/* Slots grid */}
      <div className="flex justify-center">
        <div className="grid grid-cols-1 gap-2 max-w-[800px] w-full">
          {slots.map(({ start, end }) => {
            const [h, m] = start.split(':').map(Number);
            const startMinutes = h * 60 + m;
            const outsideLimit = startMinutes > 24 * 60 - duration;
            const fullyReserved = isFullyReserved(start);
            const canFit = canFitDuration(start, duration);
            const highlighted = isHighlighted(start);

            return (
              <div
                key={start}
                className={`h-12 rounded-sm flex items-center justify-center font-medium transition-colors cursor-pointer ${
                  fullyReserved
                    ? 'bg-red-500 text-white'
                    : highlighted
                      ? 'bg-green-500 text-white'
                      : 'bg-white text-black'
                }`}
                onMouseEnter={() => {
                  if (!fullyReserved && !outsideLimit && canFit) setHoverSlot(start);
                }}
                onMouseLeave={() => setHoverSlot(null)}
                onClick={() => {
                  if (!fullyReserved && !outsideLimit && canFit) setSelectedSlot(start);
                }}
              >
                {start} - {end}
              </div>
            );
          })}
        </div>
      </div>

      {/* Confirm button */}
      {selectedSlot && user && !loading && (
        <div className="flex justify-center mt-6">
          <button
            onClick={createBooking}
            className="bg-green-600 px-6 py-2 rounded text-white hover:bg-green-700"
          >
            Confirm booking
          </button>
        </div>
      )}

      {/* Pending booking timer */}
      {pendingBooking && (
        <BookingPending booking={pendingBooking} onExpire={() => setPendingBooking(null)} />
      )}
    </section>
  );
}

function BookingPending({ booking, onExpire }: { booking: any; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const expires = new Date(booking.expires_at).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diff = Math.max(0, Math.floor((expires - now) / 1000));
      setRemaining(diff);

      if (diff <= 0) {
        clearInterval(interval);
        onExpire();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [booking.expires_at, onExpire]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="mt-4 bg-yellow-100 p-4 rounded text-black text-center">
      <p className="mb-2">To confirm your booking, contact us to pay the deposit.</p>
      <p className="font-bold">
        Time remaining: {minutes}:{seconds.toString().padStart(2, '0')}
      </p>
    </div>
  );
}
