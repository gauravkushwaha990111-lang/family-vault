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
function checkAuth() {
    const pinInput = document.getElementById('pin').value;
    const msg = document.getElementById('error-msg');

    // Filhaal hum hardcoded PIN check kar rahe hain (Jo .env mein hai)
    // Asli project mein ye 990111 hi rahega
    if (pinInput === "990111") {
        window.location.href = "/dashboard";
    } else {
        msg.innerText = "Galat PIN! Dubara koshish karein. ❌";
        msg.style.color = "#ff4b2b";
    }
}

// Page load hote hi camera start karo
window.onload = startCamera;