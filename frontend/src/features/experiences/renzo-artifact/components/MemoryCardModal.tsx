import React, { useState } from 'react';
import { X, Heart, Sparkles, Copy, Check, Printer, Edit3 } from 'lucide-react';

interface MemoryCardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryCardModal: React.FC<MemoryCardModalProps> = ({ isOpen, onClose }) => {
  const [recipient, setRecipient] = useState('Renzo');
  const [headline, setHeadline] = useState('El mejor regalo es tener una gran familia');
  const [message, setMessage] = useState(
    'Para el mejor papá del mundo: Gracias por cada mirada llena de ternura desde el primer día en que me sostuviste, por cada risa compartida en el parque, y por guiarnos siempre con amor incondicional. Eres el corazón de nuestro hogar y nuestra mayor bendición. ¡Que este nuevo año de vida te traiga toda la alegría que mereces!'
  );
  const [signature, setSignature] = useState('Con todo nuestro amor infinito, tu familia ♥');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    const fullText = `🎉 ¡FELIZ CUMPLEAÑOS, ${recipient.toUpperCase()}! 🎉\n\n"${headline}"\n\n${message}\n\n${signature}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-stone-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-amber-50 text-stone-900 rounded-3xl shadow-2xl border-4 border-amber-200/80 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Decorative Bar */}
        <div className="bg-gradient-to-r from-amber-800 via-amber-700 to-amber-900 text-amber-100 px-6 py-4 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Heart className="w-5 h-5 fill-amber-300 text-amber-300 animate-pulse" />
            <h3 className="font-serif-display text-lg font-bold tracking-wide">
              Tarjeta de Dedicatoria Especial
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-amber-200 hover:text-white hover:bg-amber-600/50 transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Card Content with Watercolor Paper Texture */}
        <div className="p-6 sm:p-10 overflow-y-auto space-y-6 bg-watercolor-paper">
          {/* Misky Challay Brand Header & Concept Banner */}
          <div className="bg-white/90 border border-amber-300/80 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/assets/aistudio/WhatsApp_Image_2026-11-05_at_22.50.19_6cc9e389.jpeg"
                alt="Misky Challay Pasteler-IA Artesanal"
                className="h-14 sm:h-16 w-auto object-contain rounded-lg"
              />
              <div>
                <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/90 px-2 py-0.5 rounded-full border border-amber-300/60 mb-0.5">
                  Experiencia Conceptual de Pasteler-IA
                </span>
                <h4 className="font-serif-display text-base font-bold text-stone-900 leading-tight">
                  Misky Challay · Pasteler-IA Artesanal
                </h4>
                <p className="text-[11px] text-stone-600 font-sans-ui mt-0.5">
                  Pastel personalizado con animación Ghibli, música y recuerdos en AR
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[10px] text-stone-500 font-medium border-t sm:border-t-0 sm:border-l border-amber-200/80 pt-2 sm:pt-0 sm:pl-4">
              <span className="text-amber-800 font-semibold">Diseña</span>
              <span>·</span>
              <span className="text-amber-800 font-semibold">Perfecciona con IA</span>
              <span>·</span>
              <span className="text-amber-800 font-semibold">Vive en AR</span>
            </div>
          </div>

          {/* Header Seal */}
          <div className="text-center space-y-2 pt-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 text-amber-800 border-2 border-amber-400/60 shadow-inner mb-1">
              <Sparkles className="w-6 h-6" />
            </div>
            <p className="text-xs uppercase tracking-widest text-amber-800/80 font-bold">
              Homenaje de Cumpleaños
            </p>
            <h2 className="font-handwriting text-3xl sm:text-5xl font-bold text-amber-950 leading-tight">
              “{headline}”
            </h2>
            <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-amber-600/60 to-transparent mx-auto mt-2" />
          </div>

          {/* Main Dedication Body */}
          <div className="relative p-6 sm:p-8 rounded-2xl bg-amber-100/60 border border-amber-300/70 shadow-sm">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Para:</label>
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    className="w-full px-3 py-2 bg-white/90 border border-amber-300 rounded-lg text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Frase Central:</label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    className="w-full px-3 py-2 bg-white/90 border border-amber-300 rounded-lg text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Mensaje del Corazón:</label>
                  <textarea
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-3 py-2 bg-white/90 border border-amber-300 rounded-lg text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500 leading-relaxed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-amber-900 mb-1">Firma:</label>
                  <input
                    type="text"
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    className="w-full px-3 py-2 bg-white/90 border border-amber-300 rounded-lg text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-center sm:text-left">
                <p className="font-serif-display text-xl sm:text-2xl font-bold text-amber-900">
                  ¡Feliz Cumpleaños, {recipient}!
                </p>
                <p className="text-stone-800 text-sm sm:text-base leading-relaxed font-sans-ui">
                  {message}
                </p>
                <div className="pt-3 text-right">
                  <p className="font-handwriting text-2xl text-amber-900 font-bold">
                    {signature}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Quick Preset Wishes */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-amber-900 block">
              Inspiración de mensajes:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() =>
                  setMessage(
                    'Renzo: Gracias por ser el mejor papá y compañero. Por enseñarme a reír, por cuidarme desde pequeña y por cada abrazo que calma cualquier tormenta. ¡Feliz cumpleaños!'
                  )
                }
                className="text-xs bg-amber-200/50 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg border border-amber-300/60 transition-colors"
              >
                Tierno de hija a papá
              </button>
              <button
                onClick={() =>
                  setMessage(
                    'El mejor regalo de la vida no se compra con dinero: se construye día a día con el amor de un hogar unido. Gracias por ser nuestro pilar, Renzo. ¡Te amamos!'
                  )
                }
                className="text-xs bg-amber-200/50 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg border border-amber-300/60 transition-colors"
              >
                Amor de familia unida
              </button>
              <button
                onClick={() =>
                  setMessage(
                    '¡Feliz Cumpleaños Renzo! Que este nuevo año de vida venga colmado de salud, bendiciones y muchas más aventuras juntos como la gran familia que somos.'
                  )
                }
                className="text-xs bg-amber-200/50 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-lg border border-amber-300/60 transition-colors"
              >
                Bendiciones y salud
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-amber-100/90 border-t border-amber-300/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 hover:text-amber-950 px-3 py-2 rounded-xl bg-amber-200/70 hover:bg-amber-200 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            <span>{isEditing ? 'Guardar Cambios' : 'Personalizar Texto'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-800 hover:text-stone-950 px-3 py-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-300 shadow-sm transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '¡Copiado!' : 'Copiar Mensaje'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 text-xs font-semibold text-stone-800 hover:text-stone-950 px-3 py-2 rounded-xl bg-white hover:bg-stone-50 border border-stone-300 shadow-sm transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir Tarjeta</span>
            </button>

            <button
              onClick={onClose}
              className="text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 px-4 py-2 rounded-xl shadow transition-colors"
            >
              Listo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
