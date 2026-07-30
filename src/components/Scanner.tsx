import { useCallback, useState } from 'react';
import { ControlRail, Gate, ReadLog, StatusStrip } from '@components/Chrome';
import { copyText, downloadCsv } from '@lib/reads';
import { useScanner } from '@lib/useScanner';

export default function Scanner() {
  const s = useScanner();
  const [toast, setToast] = useState('');

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 1400);
  }, []);

  const copy = useCallback(
    async (text: string, label = 'Copied') => {
      await copyText(text);
      flash(label);
    },
    [flash],
  );

  const live = s.status === 'running';

  return (
    <div className={`app${live ? ' scanning' : ''}`}>
      <StatusStrip live={live} engineLabel={s.engineLabel} passRef={s.refs.passRef} />

      <main className="stage" ref={s.refs.stageRef}>
        <video
          ref={s.refs.videoRef}
          playsInline
          autoPlay
          muted
          onLoadedMetadata={s.measure}
        />
        <div className="scrim" />
        <div className="reticle" ref={s.refs.reticleRef}>
          <i />
          <i />
          <i />
          <i />
          <b />
        </div>
        <canvas ref={s.refs.overlayRef} className="overlay" />
        <div className="roi" ref={s.refs.roiRef} />

        {!live && (
          <Gate busy={s.status === 'starting'} error={s.error} onStart={() => void s.start()} />
        )}
      </main>

      <ControlRail
        caps={s.caps}
        live={live}
        torchOn={s.torchOn}
        zoom={s.zoom}
        wantQr={s.wantQr}
        sound={s.sound}
        lenses={s.lenses}
        deviceId={s.deviceId}
        onTorch={() => void s.toggleTorch()}
        onZoom={s.setZoom}
        onQr={s.toggleQr}
        onSound={s.toggleSound}
        onLens={s.selectLens}
      />

      <ReadLog
        reads={s.reads}
        onCopy={(t) => void copy(t)}
        onCopyAll={() => void copy(s.reads.map((r) => r.text).join('\n'), 'All copied')}
        onCsv={() => downloadCsv(s.reads)}
        onClear={() => {
          s.clearReads();
          flash('Cleared');
        }}
      />

      <div className={`toast${toast ? ' on' : ''}`}>{toast}</div>
    </div>
  );
}
