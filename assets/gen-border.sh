#!/bin/bash

rm -rf border-frames
mkdir -p border-frames
ffmpeg -loglevel warning -stats -i ./gallery-video/ade-20191018_025041.mp4 -t 0.1 -vf scale=1920:1080 border-frames/frame-%03d.png -y

node codec.js border-frames/frame-001.png border-frames/frame-002.png border-frames/out-%d.png

ffmpeg -loglevel warning -stats -r 30 -i border-frames/out-%d.png  -c:v libx264 -preset slow -crf 22 -profile:v baseline -level 3.0 -movflags +faststart -pix_fmt yuv420p ade-border.mp4 -y
ffmpeg -loglevel warning -stats -r 30 -i border-frames/out-%d.png  -q:v 85 ade-border.webp -y
