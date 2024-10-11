/*
 * Copyright (c) Sebastian Kucharczyk <kuchen@kekse.biz>
 * https://norbert.com.es/
 */

//
const DEFAULT_SILENT = true;
const DEFAULT_REFRESH = 1000;
const DEFAULT_CONSOLE_WIDTH_MIN = 60;
const DEFAULT_PARAM_SCHEME_JSON = '../json/param.json';

//
import Application from '../shared/app.js';
import Parameter from '../shared/param.js';
import Quant from '../shared/quant.js';
import path from 'node:path';
import fs from 'node:fs';

//
class Dump extends Quant
{
	constructor(_param = null, ... _args)
	{
		//
		super(null, ... _args);

		//
		if(!(this.param = _param))
		{
			throw new Error('No _param defined');
		}
		else if(console.width > 0 && console.width < DEFAULT_CONSOLE_WIDTH_MIN)
		{
			console.error('Your terminal is too small.. My hope were ' + DEFAULT_CONSOLE_WIDTH_MIN + ' columns.');
			return process.exit(true);
		}
		
		//
		Application.registerExitHandler((... _a) => this.onExit(... _a));
		
		new Application(this, { silent: DEFAULT_SILENT,
			callback: (... _a) => this.onApplication(... _a),
			name: 'Dump', param: this.param, config: this.param.config });
	}

	onExit(_name, _code, ... _args)
	{
		return this.destroy(_name, _code, ... _args);
	}
	
	//
	onApplication(_app, _info, _config, _object, _data)
	{
		new Parameter((_check, _scheme, _instance) => {
			//
			if(!_check)
			{
				throw new Error("TODO/DEBUG");
			}

			//
			var path = this.param.path;
			var radix;
			
			if(isRadix(this.param.radix))
			{
				radix = this.param.radix;
			}
			else
			{
				radix = this.getConfig('radix');
			}
			
			for(var i = 0; i < this.param.length; ++i)
			{
				if(string(this.param[i], false))
				{
					path = this.param.splice(i--, 1)[0];
				}
				else if(isRadix(this.param[i]))
				{
					radix = this.param.splice(i--, 1)[0];
				}
			}
			
			this.radix = radix;

			if(process.STDIN)
			{
				this.path = '-';
			}
			else if(!string(this.path = path, false))
			{
				console.error('Missing file path parameter.');
				return process.exit(true);
			}
			else if(this.path === '/dev/stdin')
			{
				this.path = '-';
			}

			//
			this.radixDigits = Dump.getRadixDigitCount(this.radix);

			if(int(this.param.refresh) || bool(this.param.refresh))
			{
				this.refresh = this.param.refresh;
			}
			else
			{
				this.refresh = this.getConfig('refresh');
			}

			if(this.refresh === true)
			{
				this.refresh = DEFAULT_REFRESH;
			}

			if(!int(this.refresh) || this.refresh < 1)
			{
				this.refresh = null;
			}

			if(!string(this.fillLeft = this.getConfig('fill.left'), false))
			{
				throw new Error('Invalid cfg[fill.left] (not a non-empty String)');
			}

			if(!string(this.fillRight = this.getConfig('fill.right'), false))
			{
				throw new Error('Invalid cfg[fill.right] (not a non-empty String)');
			}
			
			//
			//TODO/check for validity!! ..
			//
			this.color = this.getConfig('color');
			
			//
			if(bool(this.param.ansi))
			{
				process.ansi = console.ansi = this.param.ansi;
			}
			else
			{
				process.ansi = console.ansi = this.getConfig('ansi');
			}
			
			//
			if(!bool(this.head = this.param.head) && !int(this.head))
			{
				this.head = this.getConfig('head');
			}
			
			if(!bool(this.tail = this.param.tail) && !int(this.tail))
			{
				this.tail = this.getConfig('tail');
			}
			
			if(int(this.head) && this.head < 1)
			{
				console.error('The --head parameter needs to be positive');
				return process.exit(true);
			}
			
			if(int(this.tail) && this.tail < 1)
			{
				console.error('The --tail parameter needs to be positive');
				return process.exit(true);
			}
			
			if(this.head && this.tail)
			{
				console.error('You can\'t use both --head and --tail together!');
				return process.exit(true);
			}

			//
			this.faintInvalid = this.getConfig('faintInvalid');
			this.consoleHeightSub = this.getConfig('consoleHeightSub');

			//
			this.open();
			this.reset();

			//
			if(this.isStdIn)
			{
				if(this.refresh)
				{
					console.error('You can\'t --refresh with stdin data.');
					return process.exit(true);
				}
				
				if(('start' in this.param) || ('stop' in this.param))
				{
					console.error('You can\'t use --start or --stop for stdin data.');
					return process.exit(true);
				}
				
				if(this.tail)
				{
					throw new Error('TODO (--tail with stdin input)!');
				}
			}
			else
			{
				if('start' in this.param)
				{
					this.start = Math.getIndex(this.param.start,
						this.stats.size);
				}
				else
				{
					this.start = 0;
				}

				if('stop' in this.param)
				{
					this.stop = Math.getIndex(this.param.stop,
						this.stats.size);
				}
				else
				{
					this.stop = (this.stats.size - 1);
				}
				
				if(this.start > this.stop)
				{
					console.error('Your --start can\'t be higher than --stop!');
					return process.exit(true);
				}

				if(this.stats.size === 0)
				{
					return process.exit(0);
				}
			}

			//
			process.stdout.on('resize', () => this.onResize());

			//
			this.print();
		}, path.join(this.param.source, DEFAULT_PARAM_SCHEME_JSON), this.param);
	}

	destroy(_name, _code, ... _args)
	{
		if(this.handle)
		{
			fs.closeSync(this.handle);
		}

		return super.destroy();
	}
	
	get isFile()
	{
		return (this.path !== '-');
	}

	get isStdIn()
	{
		return (this.path === '-');
	}

	//
	open()
	{
		if(this.isStdIn)
		{
			this.handle = 0;
		}
		else
		{
			this.handle = fs.openSync(this.path, 'r');
		}
		
		this.stats = fs.fstatSync(this.handle, { bigint: false });
		return true;
	}
	
	static write(_string)
	{
		return process.stdout.write(_string);
	}

	renderChar(_byte)
	{
		var result;
		
		if(_byte < 32 || _byte === 127)
		{
			result = this.fillRight;
			result = result.fg(... this.color.invalid.fg, false).
				bg(... this.color.invalid.bg, false);
		}
		else
		{
			result = String.fromCharCode(_byte);
			result = result.fg(... this.color.valid.fg, false).
				bg(... this.color.valid.bg, false);
		}
		
		return result + String.none();
	}
	
	//
	onResize()
	{
		this.clear();
		this.reset();
		this.print();
	}
	
	reset()
	{
		this.columns = this.calculateColumns();
		this.lines = this.calculateLines();
		this.bytes = this.calculateBytes();
	}

	clear()
	{
		this.linesPrint = 0;
		console.clear();
	}
	
	//
	handleChunk(_buffer, _position, _fin)
	{
		//
		this.line = this.lineBegin;
		
		//
		var i = 0, column; for(; i < _buffer.length; ++i)
		{
			column = _buffer[i].toString(this.radix).padStart(this.radixDigits, this.fillLeft) + ' ';
			if(this.faintInvalid && !(_buffer[i] >= 32 && _buffer[i] !== 127)) column = column.faint(true);
			this.line += column;
		}
		
		//
		var diff = (this.columns - i);
		
		if(diff > 0)
		{
			this.line += ' '.repeat(this.radixDigits + 1).repeat(diff);
		}
		
		this.line += ' ';
		
		for(i = 0; i < _buffer.length; ++i)
		{
			this.line += this.renderChar(_buffer[i]);
		}
		
		if(diff > 0)
		{
			diff = this.fillRight.repeat(diff);
			diff = diff.fg(... this.color.empty.fg, false).
				bg(... this.color.empty.bg, false);
			this.line += diff;
		}
		
		//
		this.line += String.none() + EOL;
		Dump.write(this.line); this.line = '';
		return ++this.linesPrint;
	}
	
	get lineBegin()
	{
		return (' ' + (this.linesPrint % 256).toString(this.radix).padStart(this.radixDigits, '0') + '  ').faint(true);
	}

	//
	calculateColumns()
	{
		var columns = 0;
		var length = this.lineBegin.textLength;

		while((length + columns + 3 + this.radixDigits + 1) <= (console.width || 80))
		{
			length += ((255).toString(this.radix) + ' ').length;
			++columns;
		}

		return columns;
	}

	calculateLines()
	{
		if(this.stats)
		{
			return Math._ceil(this.stats.size / this.columns);
		}
		
		return null;
	}
	
	calculateBytes()
	{
		if(!this.stats)
		{
			return null;
		}
		
		if(int(this.head))
		{
			return Math._floor(this.columns * this.head);
		}
		
		if(int(this.tail))
		{
			return Math._floor(this.columns * this.tail);
		}
		
		if(this.head || this.tail)
		{
			return Math._floor(this.columns * (console.height - this.consoleHeightSub));
		}
		
		return this.stats.size;
	}

	//
	print()
	{
		//
		if(this.linesPrint)
			Dump.write(
				String.up(this.linesPrint) +
					String.clearAfter());
		this.linesPrint = 0;

		//
		const checkLimits = () => {
			if(this.head || this.tail)
			{
				if(this.head === true || this.tail === true)
				{
					if(this.linesPrint >= (console.height - this.consoleHeightSub))
					{
						return true;
					}
				}
				else if(int(this.head))
				{
					if(this.linesPrint >= this.head)
					{
						return true;
					}
				}
				else if(int(this.tail))
				{
					if(this.linesPrint >= this.tail)
					{
						return true;
					}
				}
			}
			
			return false;
		};
		
		//
		var fin = false;
		var buffer;

		//
		if(this.isStdIn)
		{
			process.stdin.setEncoding('utf8');//(null) won't work here?
			process.stdin.on('data', (_chunk) => {
				for(var i = 0; i < _chunk.length; i += this.columns)
				{
					buffer = Uint8Array.create(_chunk.substr(i, this.columns));

					if(buffer.length < this.columns)
					{
						fin = true;
					}

					if(buffer.length > 0)
					{
						this.handleChunk(buffer, i, fin);
					}
					
					if(fin || (fin = checkLimits()))
					{
						return process.exit(0);
					}
				}
			});
			
			process.stdin.once('end', () => {
				process.exit(0);
			});
		}
		else
		{
			//
			var start = this.start;
			var diff;
		
			if(this.tail)
			{
				diff = (this.stop - this.start - this.bytes + 1);
				if(diff > 0) start += diff;
			}

			buffer = new Uint8Array(this.columns);
			var position = start;
			var total = 0;
			var read;

			//
			do
			{
				read = fs.readSync(this.handle, buffer, 0, buffer.length, position);

				if(read === 0)
				{
					fin = true;
					break;
				}
				else if(read < this.columns)
				{
					buffer = buffer.slice(0, read);
					fin = true;
				}

				position += read;
				total += read;

				diff = (position - this.stop - 1);

				if(diff >= 0)
				{
					if(diff > 0)
					{
						buffer = buffer.slice(0, -diff);
					}

					fin = true;
				}

				if(buffer.length > 0)
				{
					this.handleChunk(buffer, position, fin);
				}
				
				if(fin)
				{
					break;
				}
				else if(fin = checkLimits())
				{
					break;
				}
			}
			while(!fin);
		}

		//
		if(this.timeout) { clearTimeout(this.timeout); this.timeout = null; }
		if(this.refresh) this.timeout = setTimeout(
			() => { this.timeout = null; this.print() },
				this.refresh);
	}

	static getRadixDigitCount(_radix)
	{
		return Math._ceil(Math.logBase(_radix, 256));
	}
}

export default Dump;

//
