# fetch_examples.py
# Download genSound's three example tracks from Wikimedia Commons into
# examples/audio/, checking each file against the SHA-1 Commons publishes.
# Licenses and credits are in examples/README.md.

import hashlib
import os
import urllib.request

EXAMPLES = [
    ('chopin-nocturne-op9-no2.ogg',
     'https://upload.wikimedia.org/wikipedia/commons/0/04/Chopin_Nocturne_No._2_in_E_Flat_Major%2C_Op._9.ogg',
     '2c27d9180690551cb8c4e05a5b69a92026f6fff9'),
    ('beethoven-symphony-8-finale.ogg',
     'https://upload.wikimedia.org/wikipedia/commons/2/2d/Ludwig_van_Beethoven_-_symphony_no._8_in_f_major%2C_op._93_-_iv._allegro_vivace.ogg',
     '2b3a603fa612d79f4efa6e8a0c2e5c9b684be3ed'),
    ('macleod-hitman.ogg',
     'https://upload.wikimedia.org/wikipedia/commons/b/b3/Hitman_by_Kevin_MacLeod.ogg',
     '1b746f92afed18b2f5ea7cc58ff6d54caa8f5c9b'),
]

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'audio')
os.makedirs(out_dir, exist_ok=True)

for name, url, sha1 in EXAMPLES:
    path = os.path.join(out_dir, name)
    if os.path.exists(path) and hashlib.sha1(open(path, 'rb').read()).hexdigest() == sha1:
        print(f'{name}: already downloaded')
        continue
    # Wikimedia asks clients to identify themselves with a User-Agent
    request = urllib.request.Request(url, headers={'User-Agent': 'genSound-examples/1.0 (https://github.com/joshcoledesign/genSound)'})
    data = urllib.request.urlopen(request, timeout=60).read()
    if hashlib.sha1(data).hexdigest() != sha1:
        raise SystemExit(f'{name}: download does not match the checksum Commons publishes; not saved')
    with open(path, 'wb') as f:
        f.write(data)
    print(f'{name}: {len(data) / 1e6:.1f} MB')
