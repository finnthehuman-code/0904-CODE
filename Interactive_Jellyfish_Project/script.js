const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let width, height;
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// 마우스 좌표 관리
let mouse = { x: width / 2, y: height / 2, active: false };
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    mouse.active = true;
});
window.addEventListener('mouseleave', () => {
    mouse.active = false;
});

// 1. 심해 플랑크톤 (Marine Snow)
class Particle {
    constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.size = Math.random() * 1.5 + 0.2;
        this.vx = (Math.random() - 0.5) * 0.3;
        this.vy = -Math.random() * 0.3 - 0.1; 
        this.alpha = Math.random() * 0.5 + 0.1;
    }
    update() {
        this.x += this.vx + Math.sin(Date.now() * 0.0005 + this.y * 0.01) * 0.2;
        this.y += this.vy;
        
        if (this.y < -10) {
            this.y = height + 10;
            this.x = Math.random() * width;
        }
    }
    draw(ctx) {
        ctx.fillStyle = `rgba(150, 220, 255, ${this.alpha})`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}
const particles = Array.from({length: 100}, () => new Particle());

// 2. 물리 텐타클 엔진 (엉킴 방지 거리 제한)
class Tentacle {
    constructor(numNodes, spacing, thickness, color, glowColor, phase) {
        this.nodes = Array.from({length: numNodes}, () => ({x: width/2, y: height/2}));
        this.spacing = spacing;
        this.thickness = thickness;
        this.color = color;
        this.glowColor = glowColor;
        this.phase = phase;
    }

    update(headX, headY, headAngle, time, speed) {
        this.nodes[0].x = headX;
        this.nodes[0].y = headY;
        
        for(let i = 1; i < this.nodes.length; i++) {
            let prev = this.nodes[i-1];
            let curr = this.nodes[i];
            
            let sway = Math.sin(time * 2.0 - i * 0.1 + this.phase) * (0.2 + i * 0.01);
            let perpX = Math.cos(headAngle + Math.PI/2);
            let perpY = Math.sin(headAngle + Math.PI/2);
            
            let dx = prev.x - curr.x;
            let dy = prev.y - curr.y;
            let dist = Math.hypot(dx, dy);
            
            if (dist > 0) {
                let targetX = prev.x - (dx / dist) * this.spacing;
                let targetY = prev.y - (dy / dist) * this.spacing;
                
                curr.x += (targetX - curr.x) * 0.5;
                curr.y += (targetY - curr.y) * 0.5;
                
                curr.x += perpX * sway;
                curr.y += perpY * sway;
                
                curr.x -= Math.cos(headAngle) * speed * 0.05 * (i/this.nodes.length);
                curr.y -= Math.sin(headAngle) * speed * 0.05 * (i/this.nodes.length);
            }
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.nodes[0].x, this.nodes[0].y);
        
        for(let i = 1; i < this.nodes.length - 1; i++) {
            let xc = (this.nodes[i].x + this.nodes[i+1].x) / 2;
            let yc = (this.nodes[i].y + this.nodes[i+1].y) / 2;
            ctx.quadraticCurveTo(this.nodes[i].x, this.nodes[i].y, xc, yc);
        }
        let last = this.nodes[this.nodes.length-1];
        ctx.lineTo(last.x, last.y);
        
        if (this.glowColor) {
            ctx.strokeStyle = this.glowColor;
            ctx.lineWidth = this.thickness * 4;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
        
        ctx.strokeStyle = this.color;
        ctx.lineWidth = this.thickness;
        ctx.stroke();
    }
}

// 3. 상호작용 및 형태 개선된 해파리 본체
class InteractiveJellyfish {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.time = Math.random() * 100;
        this.size = 85;
        this.angle = -Math.PI / 2;
        this.vx = 0;
        this.vy = 0;
        
        this.outerTentacles = [];
        this.innerTentacles = [];
        
        for (let i = 0; i < 40; i++) {
            let offset = (i / 39 - 0.5) * 2.2; 
            this.outerTentacles.push({
                t: new Tentacle(35, 7, 0.8, 'rgba(150, 255, 255, 0.5)', 'rgba(0, 150, 255, 0.1)', i),
                offset: offset
            });
        }
        
        for (let i = 0; i < 6; i++) {
            let offset = (i / 5 - 0.5) * 0.8;
            this.innerTentacles.push({
                t: new Tentacle(25, 12, 2.5, 'rgba(255, 255, 255, 0.8)', 'rgba(0, 200, 255, 0.3)', i),
                offset: offset
            });
        }
    }

    update() {
        this.time += 0.025; 
        
        let cycle = (Math.sin(this.time * 2.5) + 1) / 2;
        this.pulse = Math.pow(cycle, 3); 
        let prevPulse = Math.pow((Math.sin((this.time - 0.025) * 2.5) + 1) / 2, 3);
        let thrust = Math.max(0, this.pulse - prevPulse); 

        // 마우스 트래킹 또는 가상 궤도 AI
        let targetX, targetY;
        if (mouse.active) {
            targetX = mouse.x;
            targetY = mouse.y;
        } else {
            targetX = (width / 2) + Math.cos(this.time * 0.15) * (width * 0.3);
            targetY = (height / 2) + Math.sin(this.time * 0.1) * (height * 0.3);
        }
        
        let angleToTarget = Math.atan2(targetY - this.y, targetX - this.x);
        let angleDiff = angleToTarget - this.angle;
        
        while(angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while(angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        
        this.angle += angleDiff * 0.02; // 부드러운 회전 추적

        let ax = 0;
        let ay = 0;
        let distToTarget = Math.hypot(targetX - this.x, targetY - this.y);
        
        if (!mouse.active || distToTarget > 80) {
            if (thrust > 0) {
                ax += Math.cos(this.angle) * thrust * 14;
                ay += Math.sin(this.angle) * thrust * 14;
            }
        }

        this.vx += ax;
        this.vy += ay;
        
        this.vx *= 0.93;
        this.vy *= 0.93;
        this.vy -= 0.02; // 부력

        this.x += this.vx;
        this.y += this.vy;
        
        let speed = Math.hypot(this.vx, this.vy);
        let stretch = Math.min(speed * 0.05, 0.3);
        let bellW = this.size * (1 - this.pulse * 0.15 - stretch);
        
        const updateTentacles = (tentacleArray, curveDepth) => {
            tentacleArray.forEach(item => {
                let perpAngle = this.angle + Math.PI/2;
                let baseCurve = Math.pow(item.offset, 2) * this.size * curveDepth; 
                
                let attachX = this.x + Math.cos(perpAngle) * item.offset * bellW - Math.cos(this.angle) * baseCurve;
                let attachY = this.y + Math.sin(perpAngle) * item.offset * bellW - Math.sin(this.angle) * baseCurve;
                
                attachX -= Math.cos(this.angle) * this.pulse * 10;
                attachY -= Math.sin(this.angle) * this.pulse * 10;
                
                item.t.update(attachX, attachY, this.angle, this.time, speed);
            });
        };

        updateTentacles(this.outerTentacles, 0.4);
        updateTentacles(this.innerTentacles, 0.1);
    }

    draw(ctx) {
        ctx.globalCompositeOperation = 'screen';
        this.outerTentacles.forEach(item => item.t.draw(ctx));
        this.innerTentacles.forEach(item => item.t.draw(ctx));
        
        ctx.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI/2); 
        
        let w = this.size * (1 - this.pulse * 0.15);
        let h = this.size * (1 + this.pulse * 0.3);

        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.bezierCurveTo(-w, -h * 1.5, w, -h * 1.5, w, 0); 
        
        for(let i = 1; i <= 12; i++) {
            let rx = w - (w * 2 * (i / 12));
            let ry = (i % 2 === 0) ? 0 : 4 - this.pulse * 10;
            ctx.lineTo(rx, ry);
        }
        
        let bellGrad = ctx.createLinearGradient(0, -h * 1.5, 0, 0);
        bellGrad.addColorStop(0, `rgba(180, 240, 255, ${0.4 + this.pulse * 0.2})`); 
        bellGrad.addColorStop(0.5, 'rgba(50, 150, 255, 0.1)');
        bellGrad.addColorStop(1, 'rgba(0, 50, 255, 0.0)');
        ctx.fillStyle = bellGrad;
        ctx.fill();

        ctx.globalCompositeOperation = 'screen';
        let coreGrad = ctx.createRadialGradient(0, -h * 0.4, 0, 0, -h * 0.4, w * 0.7);
        coreGrad.addColorStop(0, `rgba(255, 255, 240, ${0.8 + this.pulse * 0.2})`);
        coreGrad.addColorStop(0.3, 'rgba(180, 220, 255, 0.4)');
        coreGrad.addColorStop(1, 'rgba(0, 50, 100, 0)');
        ctx.fillStyle = coreGrad;
        
        ctx.beginPath();
        ctx.arc(0, -h * 0.4, w * 0.7, 0, Math.PI * 2);
        ctx.fill();
        
        for(let i = 0; i < 4; i++) {
            let gAngle = i * Math.PI/2 + this.time * 0.5;
            let gx = Math.cos(gAngle) * w * 0.25;
            let gy = -h * 0.4 + Math.sin(gAngle) * h * 0.1;
            ctx.beginPath();
            ctx.ellipse(gx, gy, w * 0.12, h * 0.08, gAngle, 0, Math.PI*2);
            ctx.fillStyle = `rgba(255, 255, 255, ${0.6 + this.pulse * 0.4})`;
            ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
        
        ctx.beginPath();
        ctx.moveTo(-w, 0);
        ctx.bezierCurveTo(-w, -h * 1.5, w, -h * 1.5, w, 0);
        ctx.strokeStyle = `rgba(180, 255, 255, ${0.5 + this.pulse * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.ellipse(-w * 0.3, -h * 0.8, w * 0.2, h * 0.3, -Math.PI/6, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fill();

        ctx.restore();
    }
}

const jelly = new InteractiveJellyfish(width / 2, height / 2);

function animate() {
    let bg = ctx.createRadialGradient(width * 0.3, height * 0.2, 0, width * 0.5, height * 0.5, Math.max(width, height) * 1.2);
    bg.addColorStop(0, '#0a1a3a'); 
    bg.addColorStop(0.5, '#040d1a'); 
    bg.addColorStop(1, '#010205'); 
    
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    particles.forEach(p => {
        p.update();
        p.draw(ctx);
    });

    jelly.update();
    jelly.draw(ctx);

    requestAnimationFrame(animate);
}

animate();
