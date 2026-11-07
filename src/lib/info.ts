import { FARE_SLABS } from '@/lib/fare';

export type InfoBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'call'; label: string; number: string; sub?: string }
  | { kind: 'link'; label: string; url: string };

export type InfoTopic = { id: string; title: string; icon: string; subtitle: string; blocks: InfoBlock[] };

export const TOPICS: InfoTopic[] = [
  {
    id: 'fares',
    title: 'Fares',
    icon: 'indianrupeesign.circle.fill',
    subtitle: 'Distance slabs, Sunday fares, discounts',
    blocks: [
      { kind: 'p', text: 'Delhi Metro token fares depend on the distance travelled. Current slabs came into effect on 25 August 2025.' },
      {
        kind: 'table',
        head: ['Distance', 'Mon–Sat', 'Sun/holiday'],
        rows: FARE_SLABS.map((s) => [s.label, `₹${s.normal}`, `₹${s.sunday}`]),
      },
      { kind: 'h', text: 'Discounts' },
      {
        kind: 'list',
        items: [
          'Smart card / NCMC card: 10% off every journey.',
          'Off-peak (smart card): an extra 10% off before 8 AM, 12–5 PM and after 9 PM.',
          'Airport Express Line and Rapid Metro Gurugram have their own fare tables.',
        ],
      },
      { kind: 'p', text: 'The fare shown on a route in Mettro comes from the DMRC journey planner when you are online.' },
    ],
  },
  {
    id: 'tickets',
    title: 'Tickets & cards',
    icon: 'creditcard.fill',
    subtitle: 'QR tickets, smart cards, NCMC, tourist cards',
    blocks: [
      { kind: 'h', text: 'Ways to pay' },
      {
        kind: 'list',
        items: [
          'QR ticket — buy in the DMRC Momentum 2.0 app, via WhatsApp, or Paytm/other UPI apps. Scan the QR at the gate.',
          'Smart card — buy at any customer care counter (refundable security deposit). Top up at stations, in the app, or online.',
          'NCMC (One Nation One Card) — RuPay cards issued by banks work at all Delhi Metro AFC gates.',
          'Tokens — from ticket vending machines and counters; valid for a single journey on the day of purchase.',
          'Tourist card — unlimited travel for 1 or 3 days (not valid on the Airport Express Line). Available at customer care counters.',
        ],
      },
      { kind: 'h', text: 'Good to know' },
      {
        kind: 'list',
        items: [
          'Time limit: you can stay inside the paid area for up to 170 minutes per journey.',
          'Smart cards need a minimum balance to enter. Top up before you travel.',
          'Overstaying or exiting at the entry station incurs a penalty.',
        ],
      },
    ],
  },
  {
    id: 'rules',
    title: 'Travel rules',
    icon: 'checklist',
    subtitle: 'Luggage, prohibited items, etiquette',
    blocks: [
      { kind: 'h', text: 'Luggage' },
      { kind: 'list', items: ['Maximum 25 kg per passenger.', 'Bag size up to 80 × 50 × 30 cm.', 'All bags go through X-ray screening at entry.'] },
      { kind: 'h', text: 'Not allowed' },
      {
        kind: 'list',
        items: [
          'Firearms, explosives, inflammable items, sharp objects and acids.',
          'Pets and animals (except service dogs where permitted).',
          'Eating, drinking and smoking inside trains.',
          'Travelling on the roof, sitting on the floor or blocking doors.',
          'Consuming alcohol inside metro premises.',
        ],
      },
      { kind: 'h', text: 'Reserved' },
      {
        kind: 'list',
        items: [
          'The first coach in the direction of travel is reserved for women on all lines.',
          'Seats are reserved in every coach for senior citizens, persons with disabilities and women.',
        ],
      },
    ],
  },
  {
    id: 'help',
    title: 'Helplines',
    icon: 'phone.fill',
    subtitle: 'DMRC, CISF security, emergency',
    blocks: [
      { kind: 'call', label: 'DMRC Helpline', number: '155370', sub: '24×7 — complaints, lost & found, information' },
      { kind: 'call', label: 'CISF Metro Security', number: '155655', sub: 'Security emergencies inside the metro' },
      { kind: 'call', label: 'Emergency (Police / Fire / Ambulance)', number: '112' },
      { kind: 'call', label: 'Women Helpline', number: '1091' },
      { kind: 'p', text: 'Each station also has its own contact number — open any station in Mettro and scroll to “Contact station”.' },
      { kind: 'p', text: 'Inside trains, use the passenger emergency intercom near the doors to talk to the train operator.' },
      { kind: 'link', label: 'DMRC website', url: 'https://www.delhimetrorail.com' },
    ],
  },
  {
    id: 'accessibility',
    title: 'Accessibility',
    icon: 'figure.roll',
    subtitle: 'Lifts, ramps, assistance',
    blocks: [
      {
        kind: 'list',
        items: [
          'Every station shows lifts, escalators and accessible gates in Mettro (from DMRC data).',
          'Wheelchairs are available at stations on request at the customer care centre.',
          'Tactile paths guide visually impaired passengers from entry to platforms.',
          'Seats in every coach are reserved for persons with disabilities.',
        ],
      },
    ],
  },
  {
    id: 'airport',
    title: 'Airport Express',
    icon: 'airplane.departure',
    subtitle: 'New Delhi ↔ IGI T3 ↔ Yashobhoomi',
    blocks: [
      {
        kind: 'p',
        text: 'The Orange (Airport Express) line connects New Delhi, Shivaji Stadium, Dhaula Kuan, Delhi Aerocity, Airport (T‑3), Dwarka Sector‑21 and Yashobhoomi Dwarka Sector‑25.',
      },
      {
        kind: 'list',
        items: [
          'Trains run at up to 120 km/h — New Delhi to T‑3 takes about 20 minutes.',
          'Terminal 1 is served by the Magenta Line (Terminal 1‑IGI Airport station).',
          'Separate fare table: plan a route in Mettro for the exact fare.',
          'Interchange with Yellow Line at New Delhi (via an underground walkway), Blue Line at Dwarka Sector‑21, Pink Line at Dhaula Kuan (via FOB/travelator to Durgabai Deshmukh South Campus).',
        ],
      },
    ],
  },
];

export const topicById = new Map(TOPICS.map((t) => [t.id, t]));
