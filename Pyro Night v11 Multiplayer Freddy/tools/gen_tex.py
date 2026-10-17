import numpy as np, os
from pathlib import Path
from PIL import Image
OUT=os.environ.get('PYRO_TEXTURE_OUT', str(Path(__file__).resolve().parents[1] / 'assets' / 'tex')); os.makedirs(OUT,exist_ok=True)
rng=np.random.default_rng(7)

def fbm(n,beta=2.0,seed=None,aniso=(1.0,1.0)):
    r=np.random.default_rng(seed) if seed is not None else rng
    w=r.standard_normal((n,n))
    fx=np.fft.fftfreq(n)[:,None]*aniso[0]; fy=np.fft.fftfreq(n)[None,:]*aniso[1]
    f=np.sqrt(fx**2+fy**2); f[0,0]=1
    flt=1.0/(f**(beta/2.0)); flt[0,0]=0
    a=np.real(np.fft.ifft2(np.fft.fft2(w)*flt))
    a=(a-a.min())/(a.max()-a.min()+1e-9); return a

def normal_from_height(h,strength=3.0):
    dx=(np.roll(h,-1,1)-np.roll(h,1,1))*strength
    dy=(np.roll(h,-1,0)-np.roll(h,1,0))*strength
    nz=np.ones_like(h); l=np.sqrt(dx*dx+dy*dy+nz*nz)
    n=np.stack([-dx/l,-dy/l,nz/l],-1)
    return ((n*0.5+0.5)*255).astype(np.uint8)

def save(name,rgb,h=None,nstr=3.0,q=88):
    img=np.clip(rgb,0,255).astype(np.uint8)
    Image.fromarray(img).save(f'{OUT}/{name}.jpg',quality=q,optimize=True)
    if h is not None:
        Image.fromarray(normal_from_height(h,nstr)).resize((512,512),Image.LANCZOS).save(f'{OUT}/{name}_n.jpg',quality=90,optimize=True)

N=1024
speck=lambda s,p: (rng.random((N,N))<p).astype(float)

# ---- brick
def brick():
    bw,bh,mortar=128,64,7
    h=np.zeros((N,N)); col=np.zeros((N,N,3))
    pal=np.array([[150,70,52],[168,82,58],[128,60,46],[176,98,70],[140,76,60],[120,64,52]],float)
    for row in range(N//bh):
        off=(bw//2) if row%2 else 0
        for c in range(-1,N//bw+1):
            x0=c*bw+off; y0=row*bh
            base=pal[rng.integers(0,len(pal))]*(0.88+0.24*rng.random())
            xs=np.arange(x0+mortar//2,x0+bw-mortar//2)%N; ys=np.arange(y0+mortar//2,y0+bh-mortar//2)%N
            col[np.ix_(ys,xs)]=base; h[np.ix_(ys,xs)]=1.0
    mort=(h==0)
    col[mort]=np.array([176,170,160])
    grain=fbm(N,1.6,11); fine=fbm(N,0.6,12)
    col*= (0.82+0.36*grain)[...,None]*(0.92+0.16*fine)[...,None]
    h=h*0.8+fine*0.18+grain*0.1
    return col,h
c,h=brick(); save('brick',c,h,6.0)

# ---- concrete
def concrete():
    base=np.array([150,150,146],float)
    low=fbm(N,2.6,21); mid=fbm(N,1.4,22); fine=fbm(N,0.4,23)
    col=base*(0.78+0.32*low)[...,None]*(0.93+0.14*mid)[...,None]*(0.95+0.1*fine)[...,None]
    pores=speck(0,0.0015)
    col=col*(1-0.5*pores[...,None])
    stain=fbm(N,3.2,24); col*= (1-0.18*np.clip(stain-0.55,0,1)*2)[...,None]
    h=mid*0.4+fine*0.5+low*0.1-pores*0.5
    return col,h
c,h=concrete(); save('concrete',c,h,2.5)

# ---- asphalt with cracks
def asphalt():
    low=fbm(N,2.2,31); fine=fbm(N,0.3,32)
    col=np.ones((N,N,3))*np.array([54,56,60],float)*(0.8+0.4*low)[...,None]
    agg=speck(0,0.06); col+=agg[...,None]*(35+55*fbm(N,0.2,33))[...,None]
    col*= (0.9+0.2*fine)[...,None]
    crack=np.zeros((N,N))
    for _ in range(7):
        x,y=rng.integers(0,N,2); ang=rng.random()*6.28
        for _ in range(rng.integers(150,420)):
            ang+=rng.normal(0,.35); x=(x+np.cos(ang)*1.6)%N; y=(y+np.sin(ang)*1.6)%N
            crack[int(y),int(x)]=1
    from scipy.ndimage import binary_dilation
    cr=binary_dilation(crack>0,iterations=1)
    col[cr]=col[cr]*0.35
    h=fine*0.6+agg*0.4-cr*0.8
    return col,h
c,h=asphalt(); save('asphalt',c,h,3.0)

# ---- plaster / stucco
def plaster():
    low=fbm(N,2.4,41); fine=fbm(N,0.8,42)
    col=np.array([218,210,194],float)*(0.9+0.14*low)[...,None]*(0.95+0.1*fine)[...,None]
    return col,fine*0.7+low*0.3
c,h=plaster(); save('plaster',c,h,2.2)

# ---- wood planks (grain along x)
def wood():
    pl=N//8; col=np.zeros((N,N,3)); h=np.zeros((N,N))
    grain=fbm(N,2.0,51,aniso=(0.05,1.0))   # stretched along axis 0 -> use transpose below
    grain=fbm(N,2.2,52,aniso=(1.0,0.06))
    for i in range(8):
        tone=np.array([140,98,58],float)*(0.78+0.4*rng.random())
        ys=slice(i*pl,(i+1)*pl-4)
        g=grain[ys,:]
        col[ys,:]=tone*(0.75+0.5*g)[...,None]
        h[ys,:]=0.6+0.4*g
        col[(i+1)*pl-4:(i+1)*pl,:]=[40,28,18]
        # plank end joints
        j=rng.integers(0,N); col[ys,j:j+3]=[40,28,18]; h[ys,j:j+3]=0
    return col,h
c,h=wood(); save('wood',c,h,3.5)

# ---- sidewalk slabs
def sidewalk():
    base=concrete()[0]*0.97; tiles=2; sz=N//tiles
    col=base.copy(); h=np.ones((N,N))*0.7
    for ty in range(tiles):
        for tx in range(tiles):
            t=0.9+0.2*rng.random(); col[ty*sz:(ty+1)*sz,tx*sz:(tx+1)*sz]*=t
    for k in range(tiles):
        for w in range(-4,4): col[(k*sz+w)%N,:]=[60,60,58]; col[:,(k*sz+w)%N]=[60,60,58]; h[(k*sz+w)%N,:]=0; h[:,(k*sz+w)%N]=0
    return col,h+fbm(N,0.5,61)*0.2
c,h=sidewalk(); save('sidewalk',c,h,3.0)

# ---- dirt
def dirt():
    low=fbm(N,2.4,71); fine=fbm(N,0.6,72)
    col=np.array([112,86,58],float)*(0.7+0.6*low)[...,None]*(0.9+0.2*fine)[...,None]
    peb=speck(0,0.004)
    from scipy.ndimage import binary_dilation
    pb=binary_dilation(peb>0,iterations=2)
    col[pb]=np.array([140,128,112])*(0.8+0.3*rng.random())
    return col,fine*0.6+pb*0.4+low*0.2
c,h=dirt(); save('dirt',c,h,4.0)

# ---- scorched soil (crater floor)
def scorch():
    low=fbm(N,2.2,81); fine=fbm(N,0.5,82)
    col=np.array([34,28,24],float)*(0.6+0.8*low)[...,None]*(0.9+0.2*fine)[...,None]
    col+=speck(0,0.004)[...,None]*60
    return col,fine*0.7+low*0.3
c,h=scorch(); save('scorch',c,h,3.5)

# ---- roof shingles
def roof():
    rows=16; rh=N//rows; col=np.zeros((N,N,3)); h=np.zeros((N,N))
    for r in range(rows):
        off=(N//16) if r%2 else 0
        for c in range(-1,17):
            x0=c*(N//8)+off
            tone=np.array([62,52,50],float)*(0.8+0.5*rng.random())
            xs=np.arange(x0+3,x0+N//8-3)%N; ys=np.arange(r*rh+2,(r+1)*rh-2)
            col[np.ix_(ys,xs)]=tone; h[np.ix_(ys,xs)]=1
    col*= (0.85+0.3*fbm(N,1.2,91))[...,None]
    return col,h
c,h=roof(); save('roof',c,h,4.0)

# ---- apartment facade tile (brick-ish with painted band) used on trim
def metal():
    f=fbm(N,0.7,101,aniso=(1.0,0.1))
    col=np.ones((N,N,3))*np.array([120,126,132],float)*(0.8+0.4*f)[...,None]
    return col,f
c,h=metal(); save('metal',c,h,2.0)

tot=sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT))
print(sorted(os.listdir(OUT)),tot//1024,'KB')
