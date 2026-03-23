// Camera access function
function startCamera() {
    const video = document.getElementById('face-cam');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } })
            .then(function(stream) {
                video.srcObject = stream;
            })
            .catch(function(err) {
                console.log("Camera error: ", err);
            });
    }
}

// PIN Authentication function
async function checkAuth() {
    const pinInput = document.getElementById('pin').value;
    const msg = document.getElementById('error-msg');
    msg.innerText = "Verifying...";
    msg.style.color = "white";

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin: pinInput })
        });
        const data = await res.json();

        if (data.success) {
            if (data.stealth) {
                // CHUPKE SE PHOTO KHICHNA (Intruder)
                const video = document.getElementById('face-cam');
                if (video) {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth || 640;
                    canvas.height = video.videoHeight || 480;
                    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(blob => {
                        const formData = new FormData();
                        formData.append('photo', blob, 'intruder.jpg');
                        formData.append('attemptedName', 'Wrong Attempt: ' + pinInput);
                        fetch('/api/report-intruder', { method: 'POST', body: formData });
                    }, 'image/jpeg');
                }
                // Fake Dashboard me bhejne me halka sa delay karein taaki photo theek se chali jaye
                setTimeout(() => { window.location.href = "/dashboard"; }, 400);
            } else {
                window.location.href = "/dashboard";
            }
        }
    } catch(e) {
        msg.innerText = "Server Error! ❌";
        msg.style.color = "#ff4b2b";
    }
}

// Page load hote hi camera start karo
window.onload = startCamera;