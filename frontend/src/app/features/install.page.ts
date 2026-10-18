import { Component, ViewEncapsulation, computed, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import qrcode from 'qrcode-generator';
import { Pwa } from '../core/pwa';
import { Toast } from '../core/toast';

type Platform = 'android' | 'ios' | 'ordinateur';

/** Page publique d'installation : un lien à envoyer (WhatsApp, SMS), un QR code, et les étapes selon le téléphone. */
@Component({
  selector: 'app-install-page',
  standalone: true,
  imports: [RouterLink],
  encapsulation: ViewEncapsulation.None,
  template: `
    <main class="install">
      <a class="install-back" routerLink="/">&larr; Retour</a>
      <header class="install-head">
        <span class="install-icon" aria-hidden="true"><i class="fa-solid fa-bolt"></i></span>
        <h1>Installer CoachSen sur votre téléphone</h1>
        <p>Ouvrez CoachSen comme une vraie application : un seul toucher depuis l’écran d’accueil, en plein écran, avec les rappels de séance même quand elle est fermée.</p>
      </header>

      @if (installed()) {
        <section class="install-card install-ok" role="status">
          <h2><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Déjà installée</h2>
          <p>CoachSen est installée sur cet appareil.</p>
          <a class="button primary" routerLink="/dashboard">Ouvrir CoachSen</a>
        </section>
      } @else {
        @if (pwa.canInstall()) {
          <section class="install-card">
            <h2>Installer maintenant</h2>
            <p>Votre navigateur peut l’installer en un geste.</p>
            <button type="button" class="primary" (click)="pwa.install()"><i class="fa-solid fa-mobile-screen-button" aria-hidden="true"></i> Installer CoachSen</button>
          </section>
        }

        <section class="install-card">
          <h2>{{ platform() === 'ios' ? 'Sur iPhone ou iPad' : platform() === 'android' ? 'Sur Android' : 'Sur ordinateur' }}</h2>
          @switch (platform()) {
            @case ('ios') {
              <ol>
                <li>Ouvrez ce lien dans <strong>Safari</strong> (pas dans Chrome, ni dans l’application WhatsApp).</li>
                <li>Touchez le bouton <strong>Partager</strong> (le carré avec une flèche vers le haut).</li>
                <li>Faites défiler, puis touchez <strong>« Sur l’écran d’accueil »</strong>.</li>
                <li>Touchez <strong>« Ajouter »</strong> : l’icône CoachSen apparaît.</li>
              </ol>
              <p class="install-note">Les rappels de séance quand l’application est fermée demandent iOS 16.4 ou plus, et l’application ajoutée à l’écran d’accueil.</p>
            }
            @case ('android') {
              <ol>
                <li>Ouvrez ce lien dans <strong>Chrome</strong>.</li>
                <li>Touchez le menu <strong>⋮</strong> en haut à droite.</li>
                <li>Choisissez <strong>« Installer l’application »</strong> (ou « Ajouter à l’écran d’accueil »).</li>
                <li>Validez : l’icône CoachSen apparaît.</li>
              </ol>
            }
            @default {
              <ol>
                <li>Ouvrez ce lien dans <strong>Chrome</strong> ou <strong>Edge</strong>.</li>
                <li>Cliquez sur l’icône d’installation à droite de la barre d’adresse.</li>
                <li>Confirmez avec <strong>« Installer »</strong>.</li>
              </ol>
            }
          }
          <details class="install-other">
            <summary>Un autre appareil ?</summary>
            @if (platform() !== 'ios') {
              <h3>iPhone ou iPad</h3>
              <p>Ouvrez le lien dans Safari, touchez Partager, puis « Sur l’écran d’accueil » et « Ajouter ».</p>
            }
            @if (platform() !== 'android') {
              <h3>Android</h3>
              <p>Ouvrez le lien dans Chrome, touchez le menu ⋮, puis « Installer l’application ».</p>
            }
            @if (platform() !== 'ordinateur') {
              <h3>Ordinateur</h3>
              <p>Dans Chrome ou Edge, cliquez sur l’icône d’installation de la barre d’adresse.</p>
            }
          </details>
        </section>
      }

      <section class="install-card">
        <h2>Partager le lien</h2>
        <p>Envoyez ce lien à vos collègues ou à vos clients : il s’ouvre directement sur CoachSen.</p>
        <div class="install-link"><input type="text" readonly [value]="url" aria-label="Lien de CoachSen" (focus)="$any($event.target).select()"></div>
        <div class="install-actions">
          <button type="button" class="secondary" (click)="copy()"><i class="fa-regular fa-copy" aria-hidden="true"></i> Copier le lien</button>
          <a class="button secondary" [href]="whatsapp" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> Envoyer par WhatsApp</a>
        </div>
        <figure class="install-qr">
          <div class="install-qr-box" [innerHTML]="qr()"></div>
          <figcaption>Scannez avec l’appareil photo d’un autre téléphone.</figcaption>
        </figure>
      </section>
    </main>
  `,
  styles: [`
    :root:root .install{max-width:560px;margin:0 auto;padding:20px 16px 48px;color:var(--text);display:grid;gap:16px}
    :root:root .install-back{justify-self:start;color:var(--soft);font-size:14px}
    :root:root .install-head{text-align:center;display:grid;gap:8px;justify-items:center}
    :root:root .install-head h1{margin:0;font-size:clamp(24px,6vw,32px);line-height:1.15}
    :root:root .install-head p{margin:0;color:var(--soft);max-width:46ch}
    :root:root .install-icon{display:grid;place-items:center;width:72px;height:72px;border-radius:22px;background:var(--accent);color:var(--on-accent);font-size:32px}
    :root:root .install-card{background:var(--surface);border:1px solid var(--edge);border-radius:22px;padding:20px;display:grid;gap:12px}
    :root:root .install-card h2{margin:0;font-size:18px}
    :root:root .install-card h3{margin:12px 0 2px;font-size:14px}
    :root:root .install-card p{margin:0;color:var(--soft)}
    :root:root .install-card ol{margin:0;padding-left:22px;display:grid;gap:8px}
    :root:root .install-card li{padding-left:4px}
    :root:root .install-note{font-size:13px}
    :root:root .install-ok h2 i{color:var(--accent);margin-right:6px}
    :root:root .install-ok .button{justify-self:start}
    :root:root .install-other{border-top:1px solid var(--edge);padding-top:10px}
    :root:root .install-other summary{cursor:pointer;color:var(--soft);font-size:14px}
    :root:root .install-link input{width:100%;text-overflow:ellipsis}
    :root:root .install-actions{display:flex;flex-wrap:wrap;gap:10px}
    :root:root .install-actions>*{flex:1 1 200px}
    :root:root .install-qr{margin:6px 0 0;display:grid;justify-items:center;gap:8px}
    :root:root .install-qr figcaption{color:var(--soft);font-size:13px;text-align:center}
    :root:root .install-qr-box{width:min(220px,70%);padding:12px;border-radius:18px;background:#fff;line-height:0}
    :root:root .install-qr-box svg{width:100%;height:auto;display:block}
  `],
})
export class InstallPage {
  pwa = inject(Pwa);
  private toast = inject(Toast);
  private sanitizer = inject(DomSanitizer);

  /** Adresse de l'application (celle d'où la page est ouverte). */
  url = location.origin + '/';
  whatsapp = 'https://wa.me/?text=' + encodeURIComponent('Installe CoachSen sur ton téléphone : ' + this.url);

  platform = computed<Platform>(() => {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'ordinateur';
  });

  installed = signal(
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
  );

  /** QR code vectoriel, généré dans le navigateur (aucun appel à un service extérieur). */
  qr = computed(() => {
    const code = qrcode(0, 'M');
    code.addData(this.url);
    code.make();
    return this.sanitizer.bypassSecurityTrustHtml(code.createSvgTag({ cellSize: 4, margin: 0, scalable: true }));
  });

  async copy() {
    try {
      await navigator.clipboard.writeText(this.url);
      this.toast.success('Lien copié', 'Collez-le dans un message pour l’envoyer.');
    } catch {
      this.toast.info('Copie impossible', 'Sélectionnez le lien et copiez-le à la main.');
    }
  }
}
