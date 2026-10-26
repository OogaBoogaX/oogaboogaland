// Stable screen dimensions and asset identity stay available before the original JPEG is needed.
(() => {
  "use strict";
  const BL = window.BL = window.BL || {};
  let image = null, pending = false, retryAt = 0;
  BL.labWallpaper = {
    width: 1241, height: 741,
    src: "",
    load() {
      if (!image) image = new Image();
      if (this.src) {
        if (!image.src) image.src = this.src;
      } else if (!pending && Date.now() >= retryAt) {
        const loading = BL.deferred.load("lab-wallpaper");
        if (loading) {
          pending = true;
          loading.then(() => {
            pending = false;
            if (this.src) image.src = this.src;
          }, () => { pending = false; retryAt = Date.now() + 60000; });
        } else if (this.src) image.src = this.src;
      }
      // The renderers already keep the black screen until an image has decoded. No placeholder mesh is swapped.
      return image;
    }
  };
})();
