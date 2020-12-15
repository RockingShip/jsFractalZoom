#!/bin/bash

if [ -z "$FFMPEG" ]; then FFMPEG=ffmpeg; fi

# unpack original into separate frames
rm -rf ade-frames
mkdir -p ade-frames
$FFMPEG -loglevel warning -stats -i 20191018_025041.mp4 -t 11 -vf scale=900:506 ade-frames/ade-%03d.png -y

for PPF in 1 2 5 10 20 50 100 150 200 300 600 900 1200 1600 2000 2400; do
  echo ade-${PPF}.webp
	$FFMPEG -loglevel warning -stats -r 30 -i ade-frames/ade-%03d.png -c:v splash -ppf $PPF -ppk 2 -q:v 85 splash-ade-${PPF}.mkv -y
	$FFMPEG -loglevel warning -stats -r 30 -i splash-ade-${PPF}.mkv -crf 18 ade-${PPF}.mkv -y
	$FFMPEG -loglevel warning -stats -r 30 -i splash-ade-${PPF}.mkv -q:v 85 ade-${PPF}.webp -y
done

# Upscale 90x50 to 420x236
echo Upscale 90x50
$FFMPEG -loglevel warning -stats -r 30 -i splash-ade-1.mkv  -vf scale=90:50   -crf 18 -q:v 85 ade-up90x50.mkv -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up90x50.mkv     -vf scale=420:236 -crf 18 -q:v 85 ade-up90x50-420x236.mkv -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up90x50.mkv     -vf scale=420:236 -crf 18 -q:v 85 ade-up90x50-420x236.webp -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up90x50.mkv     -vf scale=900:506 -crf 18 -q:v 85 ade-up90x50-900x506.mkv -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up90x50.mkv     -vf scale=900:506 -crf 18 -q:v 85 ade-up90x50-900x506.webp -y

# Upscale 285x160 to 420x236
echo Upscale 285x160
$FFMPEG -loglevel warning -stats -r 30 -i splash-ade-1.mkv  -vf scale=285:160 -crf 18 -q:v 85 ade-up285x160.mkv -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up285x160.mkv   -vf scale=420:236 -crf 18 -q:v 85 ade-up285x160-420x236.mkv -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up285x160.mkv   -vf scale=420:236 -crf 18 -q:v 85 ade-up285x160-420x236.webp -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up285x160.mkv   -vf scale=900:506 -crf 18 -q:v 85 ade-up285x160-900x506.mkv -y
$FFMPEG -loglevel warning -stats -r 30 -i ade-up285x160.mkv   -vf scale=900:506 -crf 18 -q:v 85 ade-up285x160-900x506.webp -y

# scale PPF=100 to 420x236
echo PPF=100
$FFMPEG -loglevel warning -stats -r 30 -i splash-ade-100.mkv  -vf scale=420:236 -crf 18 -q:v 85 ade-100-420x236.mkv -y

# Create ade side-by-size
echo SBS
$FFMPEG -loglevel warning -stats -i ade-100-420x236.mkv -i ade-up90x50-420x236.mkv -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -crf 18 -movflags +faststart -pix_fmt yuv420p ade-sbs-420x236.mp4 -y
$FFMPEG -loglevel warning -stats -i ade-100-420x236.mkv -i ade-up90x50-420x236.mkv -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -crf 18 -q:v 85 ade-sbs-420x236.webp -y
$FFMPEG -loglevel warning -stats -i ade-100.mkv         -i ade-up90x50-900x506.mkv -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -crf 18 -movflags +faststart -pix_fmt yuv420p ade-sbs-900x506.mp4 -y
$FFMPEG -loglevel warning -stats -i ade-100.mkv         -i ade-up90x50-900x506.mkv -filter_complex "[0:v][1:v]hstack=inputs=2[v]" -map "[v]" -crf 18 -q:v 85 ade-sbs-900x506.webp -y

# preview
$FFMPEG -loglevel warning -stats -i ade-100-420x236.mkv -i ade-frames/ade-001.png ade-preview.jpg -y

# scanlines in border
$FFMPEG -loglevel warning -stats -r 25 -i out-%d.png  -c:v libx264 -preset slow -crf 22 -profile:v baseline -level 3.0 -movflags +faststart -pix_fmt yuv420p -an out-new4b.mp4 -y
$FFMPEG -loglevel warning -stats -i ade-frame.mkv -crf 18 -movflags +faststart -pix_fmt yuv420p ade-frame.mp4 -y
