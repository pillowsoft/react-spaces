import * as React from "react";
import { SizeUnit } from "../types";
import * as ReactDOM from "react-dom";

export enum Type {
	ViewPort,
	Fixed,
	Fill,
	Anchored,
}

export enum Anchor {
	Left,
	Top,
	Right,
	Bottom,
}

export enum Orientation {
	Horizontal,
	Vertical,
}

export interface ISpaceStore {
	getSpace: (id: string) => ISpaceDefinition | undefined;
	addSpace: (space: ISpaceDefinition) => void;
	updateSpace: (space: ISpaceDefinition, type: Type, anchor?: Anchor, order?: number, zIndex?: number, position?: IPositionalProps) => void;
	removeSpace: (space: ISpaceDefinition) => void;
	createSpace: (
		update: () => void,
		parent: ISpaceDefinition | undefined,
		id: string,
		type: Type,
		anchor?: Anchor,
		order?: number,
		zIndex?: number,
		position?: IPositionalProps,
	) => ISpaceDefinition;
}

export interface IPositionalProps {
	left?: SizeUnit;
	top?: SizeUnit;
	right?: SizeUnit;
	bottom?: SizeUnit;
	width?: SizeUnit;
	height?: SizeUnit;
}

interface ISize {
	size: SizeUnit;
	adjusted: SizeUnit[];
	resized: number;
}

export interface ISpaceDefinition {
	update: () => void;
	adjustLeft: (adjusted: SizeUnit[]) => boolean;
	adjustRight: (adjusted: SizeUnit[]) => boolean;
	adjustTop: (adjusted: SizeUnit[]) => boolean;
	adjustBottom: (adjusted: SizeUnit[]) => boolean;
	adjustEdge: (adjusted: SizeUnit[]) => boolean;
	anchoredChildren: (anchor: Anchor, zIndex: number) => ISpaceDefinition[];
	id: string;
	type: Type;
	anchor?: Anchor;
	orientation: Orientation;
	order: number;
	position: "fixed" | "absolute" | "relative";
	children: ISpaceDefinition[];
	parent: ISpaceDefinition | undefined;
	store: ISpaceStore;
	left: ISize;
	top: ISize;
	right: ISize;
	bottom: ISize;
	width: ISize;
	height: ISize;
	zIndex: number;
}

function getSizeString(size: SizeUnit) {
	return typeof size === "string" ? size : `${size}px`;
}

function css(size: ISize) {
	if (size.size === 0 && size.adjusted.length === 0 && size.resized === 0) {
		return `0`;
	}

	const parts: string[] = [];
	if (size.size !== undefined) {
		parts.push(getSizeString(size.size));
	}

	size.adjusted.forEach((l) => parts.push(getSizeString(l)));

	if (parts.length === 0) {
		return undefined;
	}

	return `calc(${parts.join(" + ")})`;
}

function coalesce<T>(...args: T[]) {
	return args.find((x) => x !== null && x !== undefined);
}

const anchorUpdates = (space: ISpaceDefinition) => [
	{
		anchor: Anchor.Left,
		update: space.adjustLeft,
	},
	{
		anchor: Anchor.Top,
		update: space.adjustTop,
	},
	{
		anchor: Anchor.Right,
		update: space.adjustRight,
	},
	{
		anchor: Anchor.Bottom,
		update: space.adjustBottom,
	},
];

function getPosition(type: Type) {
	if (type === Type.ViewPort) {
		return "fixed";
	}
	if (type === Type.Fixed) {
		return "relative";
	}
	return "absolute";
}

function adjustmentsEqual(item1: SizeUnit[], item2: SizeUnit[]) {
	if (item1.length !== item2.length) {
		return false;
	}

	for (var i = 0, len = item1.length; i < len; i++) {
		if (item1[i] !== item2[i]) {
			return false;
		}
	}

	return true;
}

function shortuuid() {
	let firstPart = (Math.random() * 46656) | 0;
	let secondPart = (Math.random() * 46656) | 0;
	return ("000" + firstPart.toString(36)).slice(-3) + ("000" + secondPart.toString(36)).slice(-3);
}

function createStore(): ISpaceStore {
	let spaces: ISpaceDefinition[] = [];

	const setSpaces = (newSpaces: ISpaceDefinition[]) => {
		spaces = newSpaces;
	};
	const getSpaces = () => spaces;

	const recalcSpaces = (parent: ISpaceDefinition) => {
		for (var i = 0, len = parent.children.length; i < len; i++) {
			const space = parent.children[i];
			let changed = false;

			if (space.type === Type.Fill) {
				anchorUpdates(space).forEach((info) => {
					const adjusted: SizeUnit[] = [];
					const anchoredSpaces = parent.anchoredChildren(info.anchor, space.zIndex);

					anchoredSpaces.forEach((as) => {
						if (as.orientation === Orientation.Vertical) {
							if (as.height.size) {
								adjusted.push(as.height.size);
							}
						} else {
							if (as.width.size) {
								adjusted.push(as.width.size);
							}
						}
					});

					if (info.update(adjusted)) {
						changed = true;
					}
				});
			} else if (space.type === Type.Anchored) {
				const adjusted: SizeUnit[] = [];
				const anchoredSpaces = parent.anchoredChildren(space.anchor!, space.zIndex).filter((s) => s.id !== space.id && s.order < space.order);

				anchoredSpaces.forEach((as) => {
					if (as.orientation === Orientation.Vertical) {
						if (as.height.size) {
							adjusted.push(as.height.size);
						}
					} else {
						if (as.width.size) {
							adjusted.push(as.width.size);
						}
					}
				});

				if (space.adjustEdge(adjusted)) {
					changed = true;
				}
			}

			if (changed) {
				space.update();
			}
		}
	};

	const store: ISpaceStore = {
		getSpace: (id) => {
			return getSpaces().find((s) => s.id === id);
		},
		addSpace: (space) => {
			getSpaces().push(space);

			if (space.parent) {
				space.parent.children.push(space);
				recalcSpaces(space.parent);
			}
		},
		removeSpace: (space) => {
			if (space.parent) {
				setSpaces(getSpaces().filter((s) => s.id !== space.id));
				space.parent.children = space.parent.children.filter((s) => s.id !== space.id);
				recalcSpaces(space.parent);
			}
		},
		updateSpace: (space, type, anchor, order, zIndex, position) => {
			let changed = false;

			if (space.type !== type) {
				space.type = type;
				space.position = type === Type.ViewPort ? "fixed" : "absolute";
				changed = true;
			}

			if (space.anchor != anchor) {
				space.anchor = anchor;
				space.orientation = anchor === Anchor.Bottom || anchor === Anchor.Top ? Orientation.Vertical : Orientation.Horizontal;
				changed = true;

				if (type === Type.Anchored) {
					if (anchor === Anchor.Left) {
						space.adjustEdge = space.adjustLeft;
					} else if (anchor === Anchor.Top) {
						space.adjustEdge = space.adjustTop;
					} else if (anchor === Anchor.Right) {
						space.adjustEdge = space.adjustRight;
					} else if (anchor === Anchor.Bottom) {
						space.adjustEdge = space.adjustBottom;
					}
				}
			}

			if (space.left.size !== (position && position.left)) {
				space.left.size = position && position.left;
				space.left.resized = 0;
				changed = true;
			}

			if (space.right.size !== (position && position.right)) {
				space.right.size = position && position.right;
				space.right.resized = 0;
				changed = true;
			}

			if (space.top.size !== (position && position.top)) {
				space.top.size = position && position.top;
				space.top.resized = 0;
				changed = true;
			}

			if (space.bottom.size !== (position && position.bottom)) {
				space.bottom.size = position && position.bottom;
				space.bottom.resized = 0;
				changed = true;
			}

			if (space.order !== (order || 0)) {
				space.order = order || 0;
				changed = true;
			}

			if (space.zIndex !== zIndex || 0) {
				space.zIndex = zIndex || 0;
				changed = true;
			}

			if (changed) {
				space.update();
				if (space.parent) {
					recalcSpaces(space.parent);
				}
			}
		},
		createSpace: () => ({} as ISpaceDefinition),
	};

	store.createSpace = (
		update: () => void,
		parent: ISpaceDefinition | undefined,
		id: string,
		type: Type,
		anchor?: Anchor,
		order?: number,
		zIndex?: number,
		position?: IPositionalProps,
	) => {
		const newSpace: ISpaceDefinition = {
			store: store,
			parent: parent,
			update: update,
			id: id,
			type: type,
			anchor: anchor,
			orientation: anchor === Anchor.Bottom || anchor === Anchor.Top ? Orientation.Vertical : Orientation.Horizontal,
			order: order || 0,
			position: getPosition(type),
			children: [],
			zIndex: zIndex || 0,
			left: { size: position && position.left, adjusted: [], resized: 0 },
			right: { size: position && position.right, adjusted: [], resized: 0 },
			top: { size: position && position.top, adjusted: [], resized: 0 },
			bottom: { size: position && position.bottom, adjusted: [], resized: 0 },
			width: { size: position && position.width, adjusted: [], resized: 0 },
			height: { size: position && position.height, adjusted: [], resized: 0 },
			adjustLeft: () => false,
			adjustRight: () => false,
			adjustTop: () => false,
			adjustBottom: () => false,
			adjustEdge: () => false,
			anchoredChildren: () => [],
		};

		newSpace.anchoredChildren = (anchor, zIndex) =>
			newSpace.children.filter((s) => s.type === Type.Anchored && s.anchor === anchor && s.zIndex === zIndex);

		newSpace.adjustLeft = (adjusted) => {
			if (adjustmentsEqual(newSpace.left.adjusted, adjusted)) {
				return false;
			}

			newSpace.left.adjusted = adjusted;
			return true;
		};

		newSpace.adjustRight = (adjusted) => {
			if (adjustmentsEqual(newSpace.right.adjusted, adjusted)) {
				return false;
			}

			newSpace.right.adjusted = adjusted;
			return true;
		};

		newSpace.adjustTop = (adjusted) => {
			if (adjustmentsEqual(newSpace.top.adjusted, adjusted)) {
				return false;
			}

			newSpace.top.adjusted = adjusted;
			return true;
		};

		newSpace.adjustBottom = (adjusted) => {
			if (adjustmentsEqual(newSpace.bottom.adjusted, adjusted)) {
				return false;
			}

			newSpace.bottom.adjusted = adjusted;
			return true;
		};

		if (type === Type.Anchored) {
			if (anchor === Anchor.Left) {
				newSpace.adjustEdge = newSpace.adjustLeft;
			} else if (anchor === Anchor.Top) {
				newSpace.adjustEdge = newSpace.adjustTop;
			} else if (anchor === Anchor.Right) {
				newSpace.adjustEdge = newSpace.adjustRight;
			} else if (anchor === Anchor.Bottom) {
				newSpace.adjustEdge = newSpace.adjustBottom;
			}
		}

		return newSpace;
	};

	return store;
}

// REACT SPECIFIC

const StoreContext = React.createContext<ISpaceStore | undefined>(undefined);
const ParentContext = React.createContext<ISpaceDefinition | undefined>(undefined);
const LayerContext = React.createContext<number | undefined>(undefined);

export const StoreProvider: React.FC<{ store: ISpaceStore }> = (props) => (
	<StoreContext.Provider value={props.store}>{props.children}</StoreContext.Provider>
);

function useForceUpdate() {
	const [, setTick] = React.useState(0);
	const update = React.useCallback(() => {
		setTick((tick) => tick + 1);
	}, []);
	return update;
}

function useSpace(id: string | undefined, type: Type, anchor?: Anchor, order?: number, zIndex?: number, position?: IPositionalProps) {
	const update = useForceUpdate();
	const store = React.useContext(StoreContext)!;
	const parent = React.useContext(ParentContext);
	const layer = React.useContext(LayerContext);
	const spaceId = React.useRef(id || `s${shortuuid()}`);

	let space = store.getSpace(spaceId.current);

	if (!space) {
		space = store.createSpace(update, parent, spaceId.current, type, anchor, order, coalesce(layer, zIndex) || 0, position);
		store.addSpace(space);
	} else {
		store.updateSpace(space, type, anchor, order, coalesce(layer, zIndex) || 0, position);
	}

	React.useEffect(() => {
		return () => {
			store.removeSpace(space!);
		};
	}, []);

	return space;
}

interface ICommonProps {
	id?: string;
	className?: string;
	style?: React.CSSProperties;
	as?: string;
	centerContent?: "none" | "vertical" | "horizontalVertical";
	zIndex?: number;
}

interface IAnchorProps extends ICommonProps {
	id?: string;
	size: SizeUnit;
	order?: number;
	resizable?: boolean;
}

interface IViewPortProps extends ICommonProps {
	left?: SizeUnit;
	right?: SizeUnit;
	top?: SizeUnit;
	bottom?: SizeUnit;
}

interface IFixedProps extends ICommonProps {
	width?: SizeUnit;
	height: SizeUnit;
}

interface ISpaceProps extends ICommonProps {
	type: Type;
	anchor?: Anchor;
	order?: number;
	position?: IPositionalProps;
}

const HeadStyle: React.FC<{ space: ISpaceDefinition }> = (props) => {
	const space = props.space;

	const style: React.CSSProperties = {
		position: space.position,
		left: css(space.left),
		top: css(space.top),
		right: css(space.right),
		bottom: css(space.bottom),
		width: css(space.width),
		height: css(space.height),
		zIndex: space.zIndex,
		boxSizing: "border-box",
	};

	const cssString: string[] = [];

	if (style.position) {
		cssString.push(`position: ${style.position};`);
	}
	if (style.boxSizing) {
		cssString.push(`box-sizing: ${style.boxSizing};`);
	}
	if (style.left) {
		cssString.push(`left: ${style.left};`);
	}
	if (style.top) {
		cssString.push(`top: ${style.top};`);
	}
	if (style.right) {
		cssString.push(`right: ${style.right};`);
	}
	if (style.bottom) {
		cssString.push(`bottom: ${style.bottom};`);
	}
	if (style.width) {
		cssString.push(`width: ${style.width};`);
	}
	if (style.height) {
		cssString.push(`height: ${style.height};`);
	}
	if (style.zIndex) {
		cssString.push(`z-index: ${style.zIndex};`);
	}
	if (cssString.length > 0) {
		return ReactDOM.createPortal(<style>{`#${space.id} { ${cssString.join(" ")} }`}</style>, window.document.head);
	}

	return null;
};

export const LeftResizable: React.FC<Omit<IAnchorProps, "resizable">> = (props) => <Left {...props}>{props.children}</Left>;
export const Left: React.FC<IAnchorProps> = (props) => {
	return (
		<Space
			id={props.id}
			type={Type.Anchored}
			anchor={Anchor.Left}
			order={props.order}
			style={props.style}
			position={{ left: 0, top: 0, bottom: 0, width: props.size }}>
			{props.children}
		</Space>
	);
};

export const TopResizable: React.FC<Omit<IAnchorProps, "resizable">> = (props) => <Top {...props}>{props.children}</Top>;
export const Top: React.FC<IAnchorProps> = (props) => {
	return (
		<Space
			id={props.id}
			type={Type.Anchored}
			anchor={Anchor.Top}
			order={props.order}
			style={props.style}
			position={{ left: 0, top: 0, right: 0, height: props.size }}>
			{props.children}
		</Space>
	);
};

export const RightResizable: React.FC<Omit<IAnchorProps, "resizable">> = (props) => <Right {...props}>{props.children}</Right>;
export const Right: React.FC<IAnchorProps> = (props) => {
	return (
		<Space
			id={props.id}
			type={Type.Anchored}
			anchor={Anchor.Right}
			order={props.order}
			style={props.style}
			position={{ bottom: 0, top: 0, right: 0, width: props.size }}>
			{props.children}
		</Space>
	);
};

export const BottomResizable: React.FC<Omit<IAnchorProps, "resizable">> = (props) => <Bottom {...props}>{props.children}</Bottom>;
export const Bottom: React.FC<IAnchorProps> = (props) => {
	return (
		<Space
			id={props.id}
			type={Type.Anchored}
			anchor={Anchor.Bottom}
			order={props.order}
			style={props.style}
			position={{ bottom: 0, left: 0, right: 0, height: props.size }}>
			{props.children}
		</Space>
	);
};

export const Fill: React.FC<ICommonProps> = (props) => {
	return (
		<Space id={props.id} type={Type.Fill} style={props.style} position={{ left: 0, top: 0, right: 0, bottom: 0 }}>
			{props.children}
		</Space>
	);
};

export const Fixed: React.FC<IFixedProps> = (props) => {
	const { width, height } = props;
	return (
		<StoreProvider store={createStore()}>
			<Space id={props.id} type={Type.Fixed} style={props.style} position={{ width: width, height: height }}>
				{props.children}
			</Space>
		</StoreProvider>
	);
};

export const ViewPort: React.FC<IViewPortProps> = (props) => {
	const { left, top, right, bottom } = props;
	return (
		<StoreProvider store={createStore()}>
			<Space
				id={props.id}
				type={Type.ViewPort}
				style={props.style}
				position={{ left: left || 0, top: top || 0, right: right || 0, bottom: bottom || 0 }}>
				{props.children}
			</Space>
		</StoreProvider>
	);
};

const Space: React.FC<ISpaceProps> = (props) => {
	const { id, type, anchor, order, zIndex, position } = props;
	const space = useSpace(id, type, anchor, order, zIndex, position);

	return (
		<>
			<HeadStyle space={space} />
			<div id={space.id} style={props.style}>
				<ParentContext.Provider value={space}>{props.children}</ParentContext.Provider>
			</div>
		</>
	);
};

const green = { backgroundColor: "#ddffdd", padding: 15 };
const red = { backgroundColor: "#ffdddd", padding: 15 };
const blue = { backgroundColor: "#ddddff", padding: 15 };

export const Demo: React.FC = () => {
	const [visible, setVisible] = React.useState(true);
	const [size, setSize] = React.useState(true);
	return (
		<ViewPort>
			<Left size="15%" style={red}>
				Left
			</Left>
			<Fill>
				<Top size="15%" style={blue}>
					Top
				</Top>
				<Fill>
					{visible && (
						<Left size={size ? "20%" : "25%"} order={0} style={green}>
							Left 1
						</Left>
					)}
					<Left size={"20%"} order={1} style={green}>
						Left 2
					</Left>
					<Fill>
						<Top size="20%" style={red}>
							Top
						</Top>
						<Fill style={blue}>
							Fill
							<div>
								<button onClick={() => setVisible((prev) => !prev)}>Toggle visible</button>
							</div>
							<div>
								<button onClick={() => setSize((prev) => !prev)}>Toggle size</button>
							</div>
						</Fill>
						<Bottom size="20%" style={red}>
							Bottom
						</Bottom>
					</Fill>
					<Right size="20%" style={green}>
						Right
					</Right>
				</Fill>
				<Bottom size="15%" style={blue}>
					Bottom
				</Bottom>
			</Fill>
			<Right size="15%" style={red}>
				Right
			</Right>
		</ViewPort>
	);
};
