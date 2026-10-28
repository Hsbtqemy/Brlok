<script lang="ts">
  import { onDestroy, onMount } from "svelte";

  /**
   * Appareil photo dans la page (caméra arrière). On reste dans l'app : sur Android, passer par l'appareil
   * photo du téléphone peut faire recharger la page au retour, et la photo est perdue.
   */
  interface Props {
    onCapture: (file: File) => void;
    onCancel: () => void;
    /** Repli : l'appareil photo du téléphone (si la caméra de la page est refusée ou absente). */
    onFallback: () => void;
  }

  let { onCapture, onCancel, onFallback }: Props = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let stream: MediaStream | null = null;
  let error = $state("");
  let ready = $state(false);
  let taking = $state(false);

  onMount(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      error = "Ce navigateur ne donne pas accès à la caméra depuis la page.";
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      ready = true;
    } catch (e) {
      const name = (e as { name?: string })?.name;
      error =
        name === "NotAllowedError"
          ? "Accès à la caméra refusé. Autorise-le dans les réglages du site (cadenas de la barre d'adresse), ou utilise l'appareil photo du téléphone."
          : name === "NotFoundError"
            ? "Aucune caméra trouvée."
            : "Caméra indisponible ici.";
    }
  });

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  onDestroy(stop);

  async function take() {
    if (!video || !ready || taking) return;
    taking = true;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    taking = false;
    if (!blob) {
      error = "La photo n'a pas pu être prise.";
      return;
    }
    stop();
    onCapture(new File([blob], `secteur-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }

  function cancel() {
    stop();
    onCancel();
  }
</script>

<div class="camera" role="dialog" aria-label="Appareil photo">
  <!-- svelte-ignore a11y_media_has_caption -->
  <video bind:this={video} playsinline muted></video>
  {#if !ready && !error}<p class="status">Ouverture de la caméra…</p>{/if}
  {#if error}
    <div class="error">
      <p>{error}</p>
      <button
        class="primary"
        onclick={() => {
          stop();
          onFallback();
        }}>Appareil photo du téléphone</button
      >
    </div>
  {/if}
  <div class="bar">
    <button onclick={cancel}>Annuler</button>
    <button class="shutter" aria-label="Prendre la photo" disabled={!ready || taking} onclick={take}></button>
    <span class="spacer"></span>
  </div>
</div>

<style>
  .camera {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    display: flex;
    flex-direction: column;
  }
  video {
    flex: 1;
    min-height: 0;
    width: 100%;
    object-fit: contain;
    background: #000;
  }
  .status,
  .error {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    color: #fff;
    text-align: center;
    margin: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px calc(16px + env(safe-area-inset-bottom, 0px));
    background: #000;
  }
  .bar > button:first-child,
  .spacer {
    width: 96px;
  }
  .bar > button:first-child {
    color: #fff;
    background: none;
    border-color: #666;
  }
  .shutter {
    width: 72px;
    height: 72px;
    min-height: 72px;
    border-radius: 50%;
    border: 5px solid #fff;
    background: #fff;
    box-shadow: inset 0 0 0 4px #000;
    padding: 0;
  }
  .shutter:disabled {
    opacity: 0.4;
  }
</style>
