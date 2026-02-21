// ============================================
// IMAGEN 4 — AI IMAGE GENERATOR
// Frontend Logic
// ============================================

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const promptInput = document.getElementById("prompt-input");
    const charCount = document.getElementById("char-count");
    const numImages = document.getElementById("num-images");
    const aspectRatio = document.getElementById("aspect-ratio");
    const generateBtn = document.getElementById("generate-btn");
    const errorToast = document.getElementById("error-toast");
    const errorMessage = document.getElementById("error-message");
    const errorClose = document.getElementById("error-close");
    const gallerySection = document.getElementById("gallery-section");
    const generationLoading = document.getElementById("generation-loading");
    const imageGrid = document.getElementById("image-grid");
    const emptyState = document.getElementById("empty-state");
    const imageCount = document.getElementById("image-count");
    const lightbox = document.getElementById("lightbox");
    const lightboxImg = document.getElementById("lightbox-img");
    const lightboxDownload = document.getElementById("lightbox-download");
    const lightboxClose = document.getElementById("lightbox-close");

    let allImages = [];

    // --------------- Safe JSON Parser ---------------
    async function safeJson(response) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return response.json();
        }
        throw new Error(`Server error ${response.status}: ${response.statusText || "Unexpected response"}`);
    }

    // --------------- Character Counter ---------------
    promptInput.addEventListener("input", () => {
        charCount.textContent = promptInput.value.length;
    });

    // --------------- Keyboard Shortcut ---------------
    promptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            generateBtn.click();
        }
    });

    // --------------- Error Toast ---------------
    function showError(msg) {
        errorMessage.textContent = msg;
        errorToast.classList.add("visible");
    }

    function hideError() {
        errorToast.classList.remove("visible");
    }

    errorClose.addEventListener("click", hideError);

    // --------------- Generate Images ---------------
    generateBtn.addEventListener("click", async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            showError("Please enter a prompt to generate images.");
            promptInput.focus();
            return;
        }

        hideError();

        // UI: loading state
        generateBtn.classList.add("loading");
        generateBtn.disabled = true;
        generationLoading.classList.add("visible");
        emptyState.classList.add("hidden");

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout

            let response;
            try {
                response = await fetch("/api/generate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: prompt,
                        num_images: parseInt(numImages.value),
                        aspect_ratio: aspectRatio.value,
                    }),
                    signal: controller.signal,
                });
            } catch (fetchErr) {
                if (fetchErr.name === "AbortError") {
                    throw new Error("Request timed out. Please try again.");
                }
                throw new Error("Cannot reach the server. Make sure the app is running.");
            } finally {
                clearTimeout(timeoutId);
            }

            const data = await safeJson(response);

            if (!response.ok) {
                throw new Error(data.error || "Something went wrong.");
            }

            // Prepend new images to the gallery
            if (data.images && data.images.length > 0) {
                allImages = [...data.images, ...allImages];
                renderImages(data.images, true);
            }
        } catch (err) {
            showError(err.message);
        } finally {
            generateBtn.classList.remove("loading");
            generateBtn.disabled = false;
            generationLoading.classList.remove("visible");
        }
    });

    // --------------- Render Images ---------------
    function renderImages(images, prepend = false) {
        emptyState.classList.add("hidden");
        imageCount.textContent = `${allImages.length} image${allImages.length !== 1 ? "s" : ""}`;

        const fragment = document.createDocumentFragment();

        images.forEach((url, index) => {
            const card = document.createElement("div");
            card.className = "image-card";
            card.style.animationDelay = `${index * 0.1}s`;

            card.innerHTML = `
                <img src="${url}" alt="Generated image" loading="lazy">
                <div class="image-card-overlay">
                    <div class="card-actions">
                        <button class="card-btn card-btn-view" data-url="${url}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                            View
                        </button>
                        <a class="card-btn card-btn-download" href="${url}" download>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Save
                        </a>
                    </div>
                </div>
            `;

            // View button opens lightbox
            card.querySelector(".card-btn-view").addEventListener("click", (e) => {
                e.stopPropagation();
                openLightbox(url);
            });

            // Clicking the card also opens lightbox
            card.addEventListener("click", () => openLightbox(url));

            // Prevent download link from triggering lightbox
            card.querySelector(".card-btn-download").addEventListener("click", (e) => {
                e.stopPropagation();
            });

            fragment.appendChild(card);
        });

        if (prepend) {
            imageGrid.prepend(fragment);
        } else {
            imageGrid.appendChild(fragment);
        }
    }

    // --------------- Lightbox ---------------
    function openLightbox(url) {
        lightboxImg.src = url;
        lightboxDownload.href = url;
        lightbox.classList.add("visible");
        document.body.style.overflow = "hidden";
    }

    function closeLightbox() {
        lightbox.classList.remove("visible");
        document.body.style.overflow = "";
    }

    lightboxClose.addEventListener("click", closeLightbox);

    lightbox.addEventListener("click", (e) => {
        if (e.target === lightbox) closeLightbox();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeLightbox();
    });

    // --------------- Load Existing Gallery ---------------
    async function loadGallery() {
        try {
            const response = await fetch("/api/gallery");
            const data = await safeJson(response);

            if (data.images && data.images.length > 0) {
                allImages = data.images;
                renderImages(data.images);
            }
        } catch (err) {
            // Gallery load failed silently — not critical
            console.log("Could not load gallery:", err);
        }
    }

    loadGallery();
});
