#!/usr/bin/env python3
"""
CAD Forwarder - Watches backup directory and forwards to remote server

This is a SEPARATE process from the CAD listener. It:
1. Watches /opt/runsheet/data/glenmoorefc/cad_backup/ for new files
2. Reads the raw CAD data from each new file
3. Forwards it via TCP to the configured remote server
4. Does NOT touch the listener or parser in any way

Usage:
    python cad_forwarder.py --watch-dir /opt/runsheet/data/glenmoorefc/cad_backup --forward-to 178.156.253.98:19117
"""

import os
import sys
import socket
import time
import argparse
import logging
from pathlib import Path
from typing import Set

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class CADForwarder:
    def __init__(self, watch_dir: str, forward_host: str, forward_port: int):
        self.watch_dir = Path(watch_dir)
        self.forward_host = forward_host
        self.forward_port = forward_port
        self.seen_files: Set[str] = set()
        self.running = False
        
        self.stats = {
            'files_seen': 0,
            'forwards_sent': 0,
            'forwards_failed': 0,
        }
    
    def start(self):
        """Start watching directory and forwarding new files."""
        if not self.watch_dir.exists():
            logger.error(f"Watch directory does not exist: {self.watch_dir}")
            sys.exit(1)
        
        # Initialize with existing files (don't forward old ones)
        for f in self.watch_dir.iterdir():
            if f.is_file():
                self.seen_files.add(f.name)
        
        logger.info(f"Watching: {self.watch_dir}")
        logger.info(f"Forwarding to: {self.forward_host}:{self.forward_port}")
        logger.info(f"Ignoring {len(self.seen_files)} existing files")
        
        self.running = True
        
        while self.running:
            try:
                self._check_for_new_files()
            except Exception as e:
                logger.error(f"Error checking files: {e}")
            
            time.sleep(1)  # Check every second
    
    def stop(self):
        self.running = False
    
    def _check_for_new_files(self):
        """Check for new files and forward them."""
        for f in self.watch_dir.iterdir():
            if not f.is_file():
                continue
            
            if f.name in self.seen_files:
                continue
            
            # Skip files still being written (less than 1 second old)
            try:
                age = time.time() - f.stat().st_mtime
                if age < 1:
                    continue
            except:
                continue
            
            self.seen_files.add(f.name)
            self.stats['files_seen'] += 1
            
            # Skip PENDING files (not yet renamed with event number)
            if 'PENDING' in f.name:
                continue
            
            # Forward the file
            self._forward_file(f)
    
    def _forward_file(self, filepath: Path):
        """Read file and forward via TCP."""
        try:
            with open(filepath, 'rb') as f:
                raw_data = f.read()
            
            if not raw_data:
                return
            
            # Send via TCP
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10.0)
            sock.connect((self.forward_host, self.forward_port))
            sock.sendall(raw_data)
            sock.close()
            
            self.stats['forwards_sent'] += 1
            logger.info(f"Forwarded {filepath.name} ({len(raw_data)} bytes)")
            
        except Exception as e:
            self.stats['forwards_failed'] += 1
            logger.warning(f"Failed to forward {filepath.name}: {e}")


def main():
    parser = argparse.ArgumentParser(description='CAD Forwarder - Forward backup files to remote server')
    parser.add_argument('--watch-dir', required=True, help='Directory to watch for new CAD files')
    parser.add_argument('--forward-to', required=True, help='Remote server host:port')
    args = parser.parse_args()
    
    # Parse forward-to
    if ':' not in args.forward_to:
        print(f"Error: --forward-to must be host:port format")
        sys.exit(1)
    
    host, port_str = args.forward_to.rsplit(':', 1)
    try:
        port = int(port_str)
    except ValueError:
        print(f"Error: Invalid port '{port_str}'")
        sys.exit(1)
    
    forwarder = CADForwarder(
        watch_dir=args.watch_dir,
        forward_host=host,
        forward_port=port
    )
    
    try:
        forwarder.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
        forwarder.stop()
        print(f"Stats: {forwarder.stats}")


if __name__ == '__main__':
    main()
