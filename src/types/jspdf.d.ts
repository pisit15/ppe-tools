// Ambient shim for jspdf 4.x which ships without bundled .d.ts files.
// Keeps the build strict-clean without pulling in @types/jspdf.
declare module 'jspdf';
declare module 'jspdf-autotable';
